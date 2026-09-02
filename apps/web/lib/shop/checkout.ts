/**
 * Webshop — checkout-flow (server-side, fail-closed).
 *
 * startCheckout:
 *   1. product uit de DB (actief) — prijs komt van de server;
 *   2. totalen server-berekend (quantity = 1 voor dit digitale pakket);
 *   3. order PENDING aanmaken;
 *   4. Stripe Checkout Session aanmaken (server-side);
 *   5. sessie koppelen; bij Stripe-fout → order FAILED.
 *
 * handleStripeWebhookEvent:
 *   - checkout.session.completed + payment_status=paid → PAID (idempotent);
 *   - checkout.session.expired → CANCELLED;
 *   - andere events → no-op (gelogd).
 *
 * Een order wordt NOOIT op "betaald" gezet op basis van een client-redirect;
 * alleen de geverifieerde webhook doet die transitie.
 */

import {
  getActiveProductBySlug,
  type ShopSql,
} from "./products.ts";
import {
  attachCheckoutSession,
  createPendingOrder,
  markOrderCancelledBySession,
  markOrderFailed,
  markOrderPaidBySession,
} from "./orders.ts";
import type { StripeClient } from "./stripe.ts";

export type CheckoutStartResult =
  | { ok: true; redirectUrl: string; sessionId: string; orderId: string }
  | { ok: false; error: "PRODUCT_NOT_FOUND" | "CHECKOUT_FAILED" | "NOT_CONFIGURED" };

export interface CheckoutDeps {
  sql: ShopSql;
  stripe: StripeClient | null;
  baseUrl: string;
  log?: (message: string) => void;
}

export async function startCheckout(deps: CheckoutDeps, slug: string): Promise<CheckoutStartResult> {
  const log = deps.log ?? ((message: string) => console.info(`[shop] ${message}`));
  if (!deps.stripe) {
    log("checkout requested but Stripe is not configured");
    return { ok: false, error: "NOT_CONFIGURED" };
  }
  const product = await getActiveProductBySlug(deps.sql, slug);
  if (!product) {
    return { ok: false, error: "PRODUCT_NOT_FOUND" };
  }

  const quantity = 1;
  const totalCents = product.priceCents * quantity;

  // Order eerst (PENDING); pas daarna naar Stripe — nooit omgekeerd.
  const { orderId } = await createPendingOrder(deps.sql, {
    productId: product.productId,
    quantity,
    unitPriceCents: product.priceCents,
    totalCents,
    currency: product.currency,
  });

  const successUrl = `${deps.baseUrl}/shop/bevestiging?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${deps.baseUrl}/shop/${encodeURIComponent(product.slug)}`;

  let session;
  try {
    session = await deps.stripe.createCheckoutSession({
      lineItem: {
        name: product.name,
        priceCents: product.priceCents,
        currency: product.currency,
        quantity,
      },
      orderId,
      successUrl,
      cancelUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`checkout session failed for order ${orderId}: ${message.slice(0, 200)}`);
    await markOrderFailed(deps.sql, orderId);
    return { ok: false, error: "CHECKOUT_FAILED" };
  }

  await attachCheckoutSession(deps.sql, orderId, session.id);
  log(`checkout session ${session.id} created for order ${orderId}`);
  return { ok: true, redirectUrl: session.url, sessionId: session.id, orderId };
}

export type StripeWebhookEventType = "checkout.session.completed" | "checkout.session.expired";

export interface StripeSessionObject {
  id?: unknown;
  payment_status?: unknown;
  customer_email?: unknown;
}

export async function handleStripeWebhookEvent(
  deps: Pick<CheckoutDeps, "sql" | "log">,
  eventType: string,
  eventData: unknown,
): Promise<void> {
  const log = deps.log ?? ((message: string) => console.info(`[shop-webhook] ${message}`));
  if (eventType !== "checkout.session.completed" && eventType !== "checkout.session.expired") {
    log(`unhandled event type: ${eventType}`);
    return;
  }
  const session = (eventData ?? {}) as StripeSessionObject;
  if (typeof session.id !== "string" || session.id.length === 0) {
    log(`event ${eventType} without session id — ignored`);
    return;
  }

  if (eventType === "checkout.session.completed") {
    // Fail-closed: alleen betalen bij payment_status=paid. Een "completed"
    // sessie zonder paid (bv. async betaalmethoden) blijft PENDING; er is
    // geen tweede event-pad voor mode=payment+card in deze integratie.
    if (session.payment_status !== "paid") {
      log(`session ${session.id} completed but payment_status=${String(session.payment_status)} — not marked paid`);
      return;
    }
    const email = typeof session.customer_email === "string" ? session.customer_email : null;
    const updated = await markOrderPaidBySession(deps.sql, session.id, email);
    log(updated ? `order ${updated.orderId} marked PAID (session ${session.id})` : `session ${session.id} already processed`);
    return;
  }

  // checkout.session.expired
  const cancelled = await markOrderCancelledBySession(deps.sql, session.id);
  log(cancelled ? `order ${cancelled.orderId} marked CANCELLED (session ${session.id})` : `session ${session.id} expired but nothing pending`);
}
