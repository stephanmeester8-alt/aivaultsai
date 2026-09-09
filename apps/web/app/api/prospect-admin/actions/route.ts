import { NextResponse } from "next/server";
import { getSiteTenantId, requireAdminKey } from "@/lib/prospect-pipeline/admin-auth";

export const runtime = "nodejs";

/** Admin-only: dagelijkse actielijst (read-only overzicht). */
export async function GET(request: Request) {
  const denied = requireAdminKey(request);
  if (denied) return denied;

  try {
    const tenantId = getSiteTenantId();
    const { sql } = await import("@/lib/db/client");
    const { buildDailyActions, DAILY_GUIDELINE } = await import(
      "@/lib/prospect-pipeline/daily-actions"
    );
    const actions = await buildDailyActions(sql as never, tenantId);
    return NextResponse.json({ ok: true, guideline: DAILY_GUIDELINE, ...actions });
  } catch (error) {
    console.error(
      "[prospect-admin] actions failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      { error: "Daily actions could not be loaded." },
      { status: 500 },
    );
  }
}
