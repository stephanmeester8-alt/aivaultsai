import { NextResponse } from "next/server";

import { sql } from "@/lib/db/client";
import { createLeadNotifier } from "@/lib/leads/notify";
import { submitLead } from "@/lib/leads/submit";
import { validateLeadInput } from "@/lib/leads/validation";
import { RateLimiter } from "@/lib/security/rate-limit";
import { getSiteTenantId } from "@/lib/tenancy";

export const runtime = "nodejs";

/**
 * POST /api/leads — MVP lead workflow.
 *
 * Keten: honeypot-check → rate-limit → server-side validatie →
 * database-insert (primair) → Resend-notificatie (secundair, non-blocking).
 *
 * Fail-closed:
 * - malformed JSON → 400; ongeldige input → 400;
 * - honeypot gevuld → stil succes (geen signaal aan bots, geen insert);
 * - database-fout → 500 zonder interne details (nooit raw DB-errors);
 * - notificatie-fout → gelogd; de lead blijft; de bezoeker krijgt succes;
 * - rate-limit → 429 met Retry-After.
 *
 * Geen Supabase: dit project gebruikt Neon/PostgreSQL server-only
 * (lib/db/client). De browser heeft geen directe schrijf-toegang —
 * alleen deze server-route voegt leads toe.
 */

const SUBMIT_RATE_LIMIT = 5;
const SUBMIT_RATE_WINDOW_MS = 10 * 60_000;

/** Per server-instance (bestaand patroon; geen Redis voor dit MVP). */
const rateLimiter = new RateLimiter({
  limit: SUBMIT_RATE_LIMIT,
  windowMs: SUBMIT_RATE_WINDOW_MS,
});

function buildNotifier() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LEAD_FROM_EMAIL;
  const to = process.env.LEAD_NOTIFICATION_EMAIL;
  if (!apiKey || !from || !to) {
    console.warn("[leads] Resend niet geconfigureerd — notificaties uit (insert blijft werken)");
    return null;
  }
  return createLeadNotifier({ apiKey, from, to });
}

const notifier = buildNotifier();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Rate-limit (simpel per IP; Turnstile kan later vóór deze check).
  const decision = rateLimiter.check(`lead:${clientIp(request)}`);
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } },
    );
  }

  // 2. JSON parsen (malformed → 400).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // 3. Server-side validatie (honeypot inbegrepen).
  const validated = validateLeadInput(body);
  if (!validated.ok) {
    if (validated.error === "HONEYPOT") {
      // Stil negeren: zelfde succesvorm als een echte submit — geen signaal.
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // 4. Insert (primair) + notificatie (secundair).
  const result = await submitLead(
    {
      tenantId: getSiteTenantId(), // centrale site-tenant-resolutie (Sprint 3)
      sql,
      notifier,
      log: (message) => console.info(`[leads] ${message}`),
    },
    validated.data,
  );

  if (!result.ok) {
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
