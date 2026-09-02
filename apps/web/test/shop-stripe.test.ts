import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import {
  createStripeClient,
  verifyStripeWebhookSignature,
  type StripeFetch,
} from "../lib/shop/stripe.ts";

function makeFakeFetch(
  handler: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => unknown,
): { fetchImpl: StripeFetch; calls: { url: string; headers: Record<string, string>; body: string }[] } {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetchImpl: StripeFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    const result = handler(url, init);
    return {
      ok: true,
      status: 200,
      json: async () => result,
    };
  };
  return { fetchImpl, calls };
}

function signedHeader(payload: string, secret: string, timestampSeconds: number): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${payload}`)
    .digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

test("stripe: createCheckoutSession stuurt server-prijs + bearer en retourneert url", async () => {
  const { fetchImpl, calls } = makeFakeFetch(() => ({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
  }));
  const client = createStripeClient("sk_test_secret", fetchImpl);

  const result = await client.createCheckoutSession({
    lineItem: { name: "AI-assistent-pakket", priceCents: 24900, currency: "EUR", quantity: 1 },
    orderId: "order-1",
    successUrl: "https://example.com/shop/bevestiging?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://example.com/shop/ai-assistent-pakket",
  });

  assert.equal(result.id, "cs_test_123");
  assert.equal(result.url, "https://checkout.stripe.com/c/pay/cs_test_123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(calls[0]!.headers.Authorization, "Bearer sk_test_secret");
  assert.match(calls[0]!.headers["Content-Type"]!, /form-urlencoded/);
  const body = decodeURIComponent(calls[0]!.body);
  assert.match(body, /mode=payment/);
  assert.match(body, /line_items\[0\]\[price_data\]\[unit_amount\]=24900/); // server-prijs, geen client-prijs
  assert.match(body, /line_items\[0\]\[price_data\]\[currency\]=eur/);
  assert.match(body, /client_reference_id=order-1/);
  assert.match(body, /metadata\[order_id\]=order-1/);
  assert.match(body, /success_url=/);
});

test("stripe: createCheckoutSession — API-fout en ontbrekende url gooien (fail-closed)", async () => {
  const failing: StripeFetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const client = createStripeClient("sk_test_secret", failing);
  await assert.rejects(
    client.createCheckoutSession({
      lineItem: { name: "x", priceCents: 100, currency: "EUR", quantity: 1 },
      orderId: "o1",
      successUrl: "https://example.com/s",
      cancelUrl: "https://example.com/c",
    }),
    /STRIPE_API_ERROR:500/,
  );

  const noUrl = makeFakeFetch(() => ({ id: "cs_1" })); // url ontbreekt
  const client2 = createStripeClient("sk_test_secret", noUrl.fetchImpl);
  await assert.rejects(
    client2.createCheckoutSession({
      lineItem: { name: "x", priceCents: 100, currency: "EUR", quantity: 1 },
      orderId: "o1",
      successUrl: "https://example.com/s",
      cancelUrl: "https://example.com/c",
    }),
    /STRIPE_API_ERROR:invalid_session/,
  );
});

test("stripe: webhook-signature — geldig binnen tolerantie", () => {
  const secret = "whsec_test_123";
  const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_1" } } });
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = signedHeader(payload, secret, nowSeconds);
  assert.equal(verifyStripeWebhookSignature(payload, header, secret), true);
});

test("stripe: webhook-signature — fout secret / tampered payload / verlopen → false", () => {
  const secret = "whsec_test_123";
  const payload = '{"type":"checkout.session.completed"}';
  const nowSeconds = Math.floor(Date.now() / 1000);

  const header = signedHeader(payload, secret, nowSeconds);
  assert.equal(verifyStripeWebhookSignature(payload, header, "whsec_anders"), false); // verkeerd secret
  assert.equal(verifyStripeWebhookSignature(payload + "x", header, secret), false); // payload gewijzigd
  const expired = signedHeader(payload, secret, nowSeconds - 400); // > 300s tolerantie
  assert.equal(verifyStripeWebhookSignature(payload, expired, secret), false);
  assert.equal(verifyStripeWebhookSignature(payload, "v1=abc", secret), false); // geen timestamp
  assert.equal(verifyStripeWebhookSignature(payload, "", secret), false); // leeg
});

test("stripe: webhook-signature — key-rotatie (meerdere v1-waarden) werkt", () => {
  const secret = "whsec_oud";
  const payload = '{"type":"checkout.session.completed"}';
  const nowSeconds = Math.floor(Date.now() / 1000);
  const oldSig = createHmac("sha256", secret)
    .update(`${nowSeconds}.${payload}`)
    .digest("hex");
  const newSig = createHmac("sha256", "whsec_nieuw")
    .update(`${nowSeconds}.${payload}`)
    .digest("hex");
  const header = `t=${nowSeconds},v1=${oldSig},v1=${newSig}`;
  assert.equal(verifyStripeWebhookSignature(payload, header, "whsec_nieuw"), true);
  assert.equal(verifyStripeWebhookSignature(payload, header, "whsec_oud"), true);
});
