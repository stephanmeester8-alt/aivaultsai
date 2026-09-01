import { NextResponse } from "next/server";
import { readBearerToken, verifyAssistantApiKey } from "@/lib/assistant/auth";
import { runDiscoveryPipeline } from "@/lib/prospect-run/discovery-pipeline";
import type { DiscoveredCompany } from "@/lib/prospect-run/discovery";
import type { DiscoverySql } from "@/lib/prospect-run/discovery-repository";

export const runtime = "nodejs";

interface DiscoverBody {
  tenantId: string;
  companies: Array<{
    name: string;
    websiteUrl?: string;
    industry?: string;
    location?: string;
  }>;
  limit?: number;
  freshnessHours?: number;
}

function validBody(value: unknown): value is DiscoverBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (typeof body.tenantId !== "string" || !Array.isArray(body.companies)) return false;
  if (body.limit !== undefined && (typeof body.limit !== "number" || body.limit < 1 || body.limit > 10)) {
    return false;
  }
  return body.companies.every(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).name === "string" &&
      ((entry as Record<string, unknown>).websiteUrl === undefined ||
        typeof (entry as Record<string, unknown>).websiteUrl === "string") &&
      ((entry as Record<string, unknown>).industry === undefined ||
        typeof (entry as Record<string, unknown>).industry === "string") &&
      ((entry as Record<string, unknown>).location === undefined ||
        typeof (entry as Record<string, unknown>).location === "string"),
  );
}

/** Admin-only discovery trigger: validates, dedupes, researches, detects and
 * feeds the existing Prospect Run. Bounded (max 10 companies per request). */
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
    return NextResponse.json({ error: "Invalid discovery request." }, { status: 400 });
  }

  const companies: DiscoveredCompany[] = body.companies.map((entry) => ({
    name: entry.name,
    websiteUrl: entry.websiteUrl,
    industry: entry.industry,
    location: entry.location,
  }));

  try {
    const { sql } = await import("@/lib/db/client");
    const summary = await runDiscoveryPipeline(
      {
        companies,
        tenantId: body.tenantId,
        limit: body.limit,
        freshnessHours: body.freshnessHours,
      },
      { sql: sql as unknown as DiscoverySql },
    );
    return NextResponse.json(summary, { status: 202 });
  } catch (error) {
    console.error(
      "[prospect-discovery] discovery run failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json({ error: "Discovery run could not be started." }, { status: 500 });
  }
}
