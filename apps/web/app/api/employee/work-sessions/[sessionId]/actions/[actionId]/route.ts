import { NextResponse } from "next/server";
import { readBearerToken, verifyAssistantApiKey } from "@/lib/assistant/auth";
import {
  approveAction,
  rejectAction,
} from "@/lib/autonomous-employee/orchestrator";
import type { EmployeeSql } from "@/lib/autonomous-employee/work-session-repository";

export const runtime = "nodejs";

export interface RouteContext {
  params: Promise<{ sessionId: string; actionId: string }>;
}

interface ActionBody {
  decision: "approve" | "reject";
  email?: string;
  optedOut?: boolean;
  warmedUp?: boolean;
  rateAllowed?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validBody(value: unknown): value is ActionBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (body.decision !== "approve" && body.decision !== "reject") return false;
  if (body.decision === "approve") {
    if (typeof body.email !== "string" || !EMAIL_RE.test(body.email)) return false;
  }
  return true;
}

/**
 * Human-in-the-loop approval gate for employee outreach actions.
 * Approve -> existing email dispatcher (fail-closed). Reject -> stop.
 */
export async function POST(request: Request, context: RouteContext) {
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
    return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });
  }

  const { sessionId, actionId } = await context.params;

  try {
    const { sql } = await import("@/lib/db/client");
    const employeeSql = sql as unknown as EmployeeSql;
    if (body.decision === "approve") {
      const result = await approveAction(
        sessionId,
        actionId,
        {
          email: body.email!,
          optedOut: body.optedOut,
          warmedUp: body.warmedUp,
          rateAllowed: body.rateAllowed,
        },
        { sql: employeeSql },
      );
      return NextResponse.json(result, { status: 200 });
    }
    const result = await rejectAction(sessionId, actionId, { sql: employeeSql });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error(
      "[employee] approval action failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      { error: "Approval action could not be executed." },
      { status: 500 },
    );
  }
}
