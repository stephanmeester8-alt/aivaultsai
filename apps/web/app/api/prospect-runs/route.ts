import { NextResponse } from "next/server";
import { readBearerToken, verifyAssistantApiKey } from "@/lib/assistant/auth";
import { runProspectAgent } from "@/lib/prospect-run/prospect-agent";
import { createProspectAnalyzer } from "@/lib/prospect-run/openai-analyzer";
import { claimProspectRun, createProspectRun, persistRunManifest } from "@/lib/prospect-run/repository";
import type { DispatchMode, ProspectInput } from "@/lib/prospect-run/types";

export const runtime = "nodejs";

function validBody(value: unknown): value is { tenantId: string; idempotencyKey: string; dispatchMode?: DispatchMode; prospect: ProspectInput } {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  const prospect = body.prospect as Record<string, unknown> | undefined;
  return typeof body.tenantId === "string" && typeof body.idempotencyKey === "string"
    && Boolean(prospect && typeof prospect.companyName === "string" && typeof prospect.websiteUrl === "string");
}

/** Admin-only entry point. The public website never exposes prospect execution. */
export async function POST(request: Request) {
  const expectedKey = process.env.PROSPECT_RUN_API_KEY;
  if (!expectedKey) return NextResponse.json({ error: "Prospect-run admin API is not configured." }, { status: 503 });
  if (!verifyAssistantApiKey(readBearerToken(request), expectedKey)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!validBody(body)) return NextResponse.json({ error: "Invalid prospect-run request." }, { status: 400 });

  try {
    const { sql } = await import("@/lib/db/client");
    const mode: DispatchMode = body.dispatchMode === "AUTO_SEND" ? "AUTO_SEND" : "HUMAN_REVIEW";
    const runId = await createProspectRun(sql, body.prospect, mode, body.tenantId, body.idempotencyKey);
    // Model enrichment via the Responses API when OPENAI_API_KEY is set;
    // otherwise (or on any failure) the analyzer falls back to the
    // deterministic baseline. Never blocks or fails a run.
    const result = await runProspectAgent(runId, body.prospect, mode, {
      claimRun: (id) => claimProspectRun(sql, id),
      analyze: createProspectAnalyzer(),
      persistManifest: (manifest) => persistRunManifest(sql, manifest),
    });
    return NextResponse.json(result, { status: result.state === "BLOCKED" ? 409 : 202 });
  } catch (error) {
    console.error("prospect-run: request failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Prospect run could not be started." }, { status: 500 });
  }
}
