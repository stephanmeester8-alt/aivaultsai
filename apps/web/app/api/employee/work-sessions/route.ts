import { NextResponse } from "next/server";
import { readBearerToken, verifyAssistantApiKey } from "@/lib/assistant/auth";
import { startWorkSession } from "@/lib/autonomous-employee/orchestrator";
import type { EmployeeSql } from "@/lib/autonomous-employee/work-session-repository";

export const runtime = "nodejs";

interface StartBody {
  tenantId: string;
  /** Defaults to today's UTC date — the daily morning run key. */
  sessionKey?: string;
  companies: Array<{ name: string; websiteUrl?: string; industry?: string; location?: string }>;
  limit?: number;
  freshnessHours?: number;
  qualifiedThreshold?: number;
  insufficientThreshold?: number;
}

function validBody(value: unknown): value is StartBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (typeof body.tenantId !== "string" || !Array.isArray(body.companies)) return false;
  if (body.companies.length === 0 || body.companies.length > 10) return false;
  if (body.limit !== undefined && (typeof body.limit !== "number" || body.limit < 1 || body.limit > 10)) return false;
  return body.companies.every(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).name === "string",
  );
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Morning-trigger endpoint (admin-only). Idempotent: one session per tenant
 * per sessionKey; a second call returns the existing session instead of
 * starting a duplicate run. A cron/scheduler may call this endpoint daily.
 */
export async function POST(request: Request) {
  const expectedKey = process.env.PROSPECT_RUN_API_KEY;
  if (!expectedKey) {
    return NextResponse.json({ error: "Prospect-run admin API is not configured." }, { status: 503 });
  }
  if (!verifyAssistantApiKey(readBearerToken(request), expectedKey)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!validBody(body)) {
    return NextResponse.json({ error: "Invalid employee work session request." }, { status: 400 });
  }

  try {
    const { sql } = await import("@/lib/db/client");
    const result = await startWorkSession(
      {
        tenantId: body.tenantId,
        sessionKey: body.sessionKey ?? todayKey(),
        companies: body.companies.map((c) => ({
          name: c.name,
          websiteUrl: c.websiteUrl,
          industry: c.industry,
          location: c.location,
        })),
        limit: body.limit,
        freshnessHours: body.freshnessHours,
        qualifiedThreshold: body.qualifiedThreshold,
        insufficientThreshold: body.insufficientThreshold,
      },
      { sql: sql as unknown as EmployeeSql },
    );
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    console.error(
      "[employee] work session failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      { error: "Employee work session could not be completed." },
      { status: 500 },
    );
  }
}
