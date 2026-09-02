import assert from "node:assert/strict";
import { test } from "node:test";

import {
  handleStripeWebhookEvent,
  startCheckout,
  type CheckoutDeps,
} from "../lib/shop/checkout.ts";
import {
  attachCheckoutSession,
  createPendingOrder,
  getOrderBySessionId,
  markOrderCancelledBySession,
  markOrderPaidBySession,
} from "../lib/shop/orders.ts";
import { getActiveProductBySlug, listActiveProducts } from "../lib/shop/products.ts";
import type { StripeClient } from "../lib/shop/stripe.ts";

interface ProductRow {
  product_id: string;
  slug: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  tax_note: string;
  active: boolean;
}

const PRODUCT: ProductRow = {
  product_id: "11111111-1111-4111-8111-111111111111",
  slug: "ai-assistent-pakket",
  name: "AI-assistent + cursus + persoonlijke onboarding",
  description: "Pakket",
  price_cents: 24900,
  currency: "EUR",
  tax_note: "excl. btw",
  active: true,
};

interface FakeState {
  products: ProductRow[];
  orders: Array<{
    order_id: string;
    product_id: string;
    session_id: string | null;
    status: string;
    customer_email: string | null;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
    currency: string;
  }>;
  calls: string[];
  insertValues: unknown[][];
}

/** Fake sql die de shop-queries simuleert (zelfde patronen als de repositories). */
function makeShopSql(state?: Partial<FakeState>) {
  const full: FakeState = {
    products: state?.products ?? [PRODUCT],
    orders: state?.orders ?? [],
    calls: state?.calls ?? [],
    insertValues: state?.insertValues ?? [],
  };
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    full.calls.push(text.slice(0, 80));

    if (text.includes("FROM shop_products") && text.includes("WHERE active = TRUE")) {
      return full.products.filter((p) => p.active);
    }
    if (text.includes("FROM shop_products")) {
      const slug = values[0];
      const row = full.products.find((p) => p.slug === slug);
      if (!row) return [];
      return [row];
    }
    if (text.includes("INSERT INTO shop_orders")) {
      full.insertValues.push(values);
      const orderId = `order-${full.orders.length + 1}`;
      full.orders.push({
        order_id: orderId,
        product_id: String(values[0]),
        session_id: null,
        status: "PENDING",
        customer_email: null,
        quantity: Number(values[1]),
        unit_price_cents: Number(values[2]),
        total_cents: Number(values[3]),
        currency: String(values[4]),
      });
      return [{ order_id: orderId }];
    }
    if (text.includes("SET session_id =")) {
      // Template: SET session_id = ${sessionId} WHERE order_id = ${orderId}
      const order = full.orders.find((o) => o.order_id === values[1] && o.session_id === null);
      if (order) order.session_id = String(values[0]);
      return [];
    }
    if (text.includes("SET status = 'PAID'")) {
      const order = full.orders.find((o) => o.session_id === values[1] && o.status === "PENDING");
      if (!order) return [];
      order.status = "PAID";
      order.customer_email = values[0] === null ? null : String(values[0]);
      return [{ order_id: order.order_id }];
    }
    if (text.includes("SET status = 'CANCELLED'")) {
      const order = full.orders.find((o) => o.session_id === values[0] && o.status === "PENDING");
      if (!order) return [];
      order.status = "CANCELLED";
      return [{ order_id: order.order_id }];
    }
    if (text.includes("SET status = 'FAILED'")) {
      const order = full.orders.find((o) => o.order_id === values[0] && o.status === "PENDING");
      if (order) order.status = "FAILED";
      return [];
    }
    if (text.includes("FROM shop_orders")) {
      const sessionId = values[0];
      const order = full.orders.find((o) => o.session_id === sessionId);
      if (!order) return [];
      return [order];
    }
    return [];
  };
  return { sql, state: full };
}

function makeStripeClient(
  overrides: Partial<StripeClient> = {},
): StripeClient & { calls: { count: number } } {
  const calls = { count: 0 };
  const client: StripeClient = {
    createCheckoutSession: async (request) => {
      calls.count += 1;
      void request;
      return { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" };
    },
    ...overrides,
  };
  return Object.assign(client, { calls });
}

function makeDeps(overrides: Partial<CheckoutDeps> = {}) {
  const shop = makeShopSql();
  return {
    deps: {
      sql: shop.sql,
      stripe: makeStripeClient(),
      baseUrl: "https://www.aivaultsai.one",
      log: () => {},
      ...overrides,
    } as CheckoutDeps,
    shop,
  };
}

test("shop: startCheckout — server-prijs uit DB, order PENDING, sessie gekoppeld, redirect", async () => {
  const { deps, shop } = makeDeps();
  const result = await startCheckout(deps, "ai-assistent-pakket");

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.redirectUrl, "https://checkout.stripe.com/c/pay/cs_test_1");
    assert.equal(result.sessionId, "cs_test_1");
  }
  // Order-insert gebruikte de DB-prijs (24900), nooit een client-prijs.
  assert.equal(shop.state.insertValues.length, 1);
  const insert = shop.state.insertValues[0]!;
  assert.equal(insert[2], 24900); // unit_price_cents
  assert.equal(insert[3], 24900); // total_cents
  assert.equal(insert[1], 1); // quantity
  assert.equal(shop.state.orders[0]!.status, "PENDING");
  assert.equal(shop.state.orders[0]!.session_id, "cs_test_1");
});

test("shop: startCheckout — onbekend product / geen Stripe → fail-closed zonder order", async () => {
  const { deps, shop } = makeDeps();
  const missing = await startCheckout(deps, "bestaand-niet");
  assert.deepEqual(missing, { ok: false, error: "PRODUCT_NOT_FOUND" });
  assert.equal(shop.state.orders.length, 0);

  const notConfigured = await startCheckout({ ...deps, stripe: null }, "ai-assistent-pakket");
  assert.deepEqual(notConfigured, { ok: false, error: "NOT_CONFIGURED" });
  assert.equal(shop.state.orders.length, 0);
});

test("shop: startCheckout — Stripe-fout → order FAILED + CHECKOUT_FAILED", async () => {
  const failing = makeStripeClient({
    createCheckoutSession: async () => {
      throw new Error("STRIPE_API_ERROR:500");
    },
  });
  const { deps, shop } = makeDeps({ stripe: failing });
  const result = await startCheckout(deps, "ai-assistent-pakket");
  assert.deepEqual(result, { ok: false, error: "CHECKOUT_FAILED" });
  assert.equal(shop.state.orders[0]!.status, "FAILED");
});

test("shop: webhook completed+paid → PAID met e-mail; tweede event idempotent", async () => {
  const { deps, shop } = makeDeps();
  const checkout = await startCheckout(deps, "ai-assistent-pakket");
  assert.equal(checkout.ok, true);

  await handleStripeWebhookEvent(
    { sql: shop.sql, log: () => {} },
    "checkout.session.completed",
    { id: "cs_test_1", payment_status: "paid", customer_email: "klant@example.com" },
  );
  assert.equal(shop.state.orders[0]!.status, "PAID");
  assert.equal(shop.state.orders[0]!.customer_email, "klant@example.com");

  // Duplicaat: zelfde sessie opnieuw → geen tweede transitie (idempotent).
  await handleStripeWebhookEvent(
    { sql: shop.sql, log: () => {} },
    "checkout.session.completed",
    { id: "cs_test_1", payment_status: "paid", customer_email: "klant@example.com" },
  );
  assert.equal(shop.state.orders[0]!.status, "PAID");
});

test("shop: webhook — completed zonder paid / expired / onbekend type → fail-closed", async () => {
  const { deps, shop } = makeDeps();
  await startCheckout(deps, "ai-assistent-pakket");

  // completed maar payment_status != paid → NOOIT PAID.
  await handleStripeWebhookEvent(
    { sql: shop.sql, log: () => {} },
    "checkout.session.completed",
    { id: "cs_test_1", payment_status: "unpaid" },
  );
  assert.equal(shop.state.orders[0]!.status, "PENDING");

  // expired → CANCELLED (alleen vanuit PENDING).
  await handleStripeWebhookEvent({ sql: shop.sql, log: () => {} }, "checkout.session.expired", {
    id: "cs_test_1",
  });
  assert.equal(shop.state.orders[0]!.status, "CANCELLED");

  // Onbekend type → no-op.
  await handleStripeWebhookEvent({ sql: shop.sql, log: () => {} }, "invoice.paid", { id: "in_1" });
  assert.equal(shop.state.orders[0]!.status, "CANCELLED");
});

test("shop: repositories — mapping en status-lookup", async () => {
  const { deps, shop } = makeDeps();
  await startCheckout(deps, "ai-assistent-pakket");

  const paid = await markOrderPaidBySession(shop.sql, "cs_test_1", "k@example.com");
  assert.ok(paid);
  assert.equal(shop.state.orders[0]!.status, "PAID");

  // Al verwerkt → null (idempotent).
  const again = await markOrderPaidBySession(shop.sql, "cs_test_1", "k@example.com");
  assert.equal(again, null);

  // Lookup voor de bevestigingspagina.
  const order = await getOrderBySessionId(shop.sql, "cs_test_1");
  assert.equal(order?.status, "PAID");
  assert.equal(order?.customerEmail, "k@example.com");
  assert.equal(order?.totalCents, 24900);
  assert.equal(await getOrderBySessionId(shop.sql, "cs_onbekend"), null);

  // Cancel alleen vanuit PENDING.
  await startCheckout({ ...deps, stripe: makeStripeClient() }, "ai-assistent-pakket");
  const secondSession = shop.state.orders[1]!.session_id!;
  const cancelled = await markOrderCancelledBySession(shop.sql, secondSession);
  assert.ok(cancelled);
  assert.equal(shop.state.orders[1]!.status, "CANCELLED");

  // Product-queries.
  const product = await getActiveProductBySlug(shop.sql, "ai-assistent-pakket");
  assert.equal(product?.priceCents, 24900);
  assert.equal(product?.taxNote, "excl. btw");
  assert.equal(await getActiveProductBySlug(shop.sql, "inactief"), null);
  const list = await listActiveProducts(shop.sql);
  assert.equal(list.length, 1);

  // attachCheckoutSession is eenmalig.
  const orderId = shop.state.orders[1]!.order_id;
  await attachCheckoutSession(shop.sql, orderId, "cs_andere");
  assert.equal(shop.state.orders[1]!.session_id, secondSession); // niet overschreven

  // createPendingOrder retourneert orderId.
  const created = await createPendingOrder(shop.sql, {
    productId: PRODUCT.product_id,
    quantity: 1,
    unitPriceCents: 24900,
    totalCents: 24900,
    currency: "EUR",
  });
  assert.ok(created.orderId);
});
