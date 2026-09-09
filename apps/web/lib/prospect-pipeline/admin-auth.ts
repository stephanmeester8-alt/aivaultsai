import { NextResponse } from "next/server";
import { readBearerToken, verifyAssistantApiKey } from "@/lib/assistant/auth";
import { getSiteTenantId } from "@/lib/tenancy";

export const runtime = "nodejs";

/**
 * Auth helper voor /api/prospect-admin/*. Alleen bereikbaar met dezelfde
 * server-only admin key als de bestaande prospect/employee-routes. De
 * publieke website exposeert deze routes nooit.
 */
export function requireAdminKey(request: Request): NextResponse | null {
  const expectedKey = process.env.PROSPECT_RUN_API_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: "Prospect admin API is not configured." },
      { status: 503 },
    );
  }
  if (!verifyAssistantApiKey(readBearerToken(request), expectedKey)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 512 * 1024) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  return JSON.parse(text) as unknown;
}

export { getSiteTenantId };
