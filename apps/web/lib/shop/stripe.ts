/**
 * Webshop — Stripe-integratie (server-only).
 *
 * Bewust ZONDER SDK-dependency: de officiële Stripe REST API wordt
 * aangeroepen met fetch (Checkout Sessions), en webhook-signatures worden
 * lokaal geverifieerd (Stripe v1-HMAC, tolerantie 300s, timing-safe).
 *
 * Fail-closed:
 * - secret key ontbreekt → geen client (expliciete NOT_CONFIGURED);
 * - prijs komt van de SERVER (priceCents uit de DB), nooit van de browser;
 * - webhook: verkeerde/verlopen/tampered signature → false;
 * - API-fout → throw (de caller zet de order op FAILED).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

export interface StripeProductLine {
  name: string;
  priceCents: number;
  currency: string;
  quantity: number;
}

export interface CheckoutSessionRequest {
  lineItem: StripeProductLine;
  orderId: string;
  successUrl: string;
  cancelUrl: string;
  /** Optioneel (mode=payment): laat Stripe de e-mail vragen als die ontbreekt. */
  customerEmail?: string;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
}

export interface StripeClient {
  createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSessionResult>;
}

export type StripeFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Echte Stripe-client; secret key komt uit de server-omgeving. */
export function createStripeClient(
  secretKey: string,
  fetchImpl: StripeFetch = fetch as unknown as StripeFetch,
): StripeClient {
  return {
    async createCheckoutSession(request) {
      const body = new URLSearchParams({
        mode: "payment",
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        "line_items[0][quantity]": String(request.lineItem.quantity),
        "line_items[0][price_data][currency]": request.lineItem.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(request.lineItem.priceCents),
        "line_items[0][price_data][product_data][name]": request.lineItem.name,
        client_reference_id: request.orderId,
        "metadata[order_id]": request.orderId,
      });
      if (request.customerEmail && request.customerEmail.length > 0) {
        body.set("customer_email", request.customerEmail);
      }

      const response = await fetchImpl(`${STRIPE_API_BASE}/checkout/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`STRIPE_API_ERROR:${response.status}`);
      }
      const data = (await response.json()) as { id?: unknown; url?: unknown };
      if (typeof data.id !== "string" || data.id.length === 0 || typeof data.url !== "string" || data.url.length === 0) {
        throw new Error("STRIPE_API_ERROR:invalid_session");
      }
      return { id: data.id, url: data.url };
    },
  };
}

function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/**
 * Stripe webhook-signature-verificatie (v1): header "t=<ts>,v1=<hmac>,…".
 * Puur en testbaar: retourneert true alleen bij geldige HMAC binnen de
 * tolerantie. Ondersteunt key-rotatie (meerdere v1-waarden).
 */
export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === "t") {
      const parsed = Number(value);
      timestamp = Number.isFinite(parsed) ? parsed : null;
    } else if (key === "v1" && value.length > 0) {
      signatures.push(value);
    }
  }
  if (timestamp === null || signatures.length === 0) return false;
  const nowSeconds = nowMs / 1000;
  if (Math.abs(nowSeconds - timestamp) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return signatures.some((signature) => safeEqualHex(signature, expected));
}
