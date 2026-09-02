import { NextResponse } from "next/server";

import { sql } from "@/lib/db/client";
import { getStripeWebhookSecret } from "@/lib/shop/config";
import { verifyStripeWebhookSignature } from "@/lib/shop/stripe";
import { handleStripeWebhookEvent } from "@/lib/shop/checkout";

export const runtime = "nodejs";

/**
 * Stripe-webhook (server-only).
 *
 * - raw body + geverifieerde signature (v1-HMAC, tolerantie 300s);
 * - alleen geverifieerde events muteren orders (PAID/CANCELLED);
 * - fouten → 500 zodat Stripe het event opnieuw levert (retry);
 *   dubbele events zijn idempotent (conditional UPDATE).
 */

export async function POST(request: Request): Promise<NextResponse> {
  const secret = getStripeWebhookSecret();
  if (!secret) {
    console.error("[shop-webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const payload = await request.text();
  if (!verifyStripeWebhookSignature(payload, signature, secret)) {
    console.warn("[shop-webhook] invalid signature rejected");
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: { type?: unknown; data?: { object?: unknown } };
  try {
    event = JSON.parse(payload) as { type?: unknown; data?: { object?: unknown } };
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (typeof event.type !== "string") {
    return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  }

  try {
    await handleStripeWebhookEvent(
      { sql, log: (message) => console.info(`[shop-webhook] ${message}`) },
      event.type,
      event.data?.object,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[shop-webhook] processing failed: ${message.slice(0, 300)}`);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
