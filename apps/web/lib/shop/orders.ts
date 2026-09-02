/**
 * Webshop — order-repository.
 *
 * Status-transities zijn fail-closed en idempotent (conditional UPDATE):
 * - PENDING → PAID   alleen via de geverifieerde webhook (session match);
 * - PENDING → CANCELLED bij verlopen Checkout-sessie;
 * - PENDING → FAILED als de Checkout-sessie niet kon worden aangemaakt.
 * Een tweede webhook-event voor dezelfde sessie is een no-op (0 rijen).
 */

import type { ShopOrder, ShopOrderStatus } from "./types.ts";
import type { ShopSql } from "./products.ts";

export interface CreatePendingOrderInput {
  productId: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  currency: string;
}

interface OrderRow {
  order_id?: unknown;
  product_id?: unknown;
  session_id?: unknown;
  status?: unknown;
  customer_email?: unknown;
  quantity?: unknown;
  unit_price_cents?: unknown;
  total_cents?: unknown;
  currency?: unknown;
  created_at?: unknown;
}

export function mapOrder(row: OrderRow | undefined): ShopOrder | null {
  if (!row) return null;
  const status = row.status;
  const validStatus: readonly ShopOrderStatus[] = ["PENDING", "PAID", "CANCELLED", "FAILED"];
  if (
    typeof row.order_id !== "string" ||
    typeof row.product_id !== "string" ||
    (row.session_id !== null && typeof row.session_id !== "string") ||
    typeof status !== "string" ||
    !(validStatus as readonly string[]).includes(status) ||
    typeof row.quantity !== "number" ||
    typeof row.unit_price_cents !== "number" ||
    typeof row.total_cents !== "number" ||
    typeof row.currency !== "string"
  ) {
    return null;
  }
  return {
    orderId: row.order_id,
    productId: row.product_id,
    sessionId: typeof row.session_id === "string" ? row.session_id : null,
    status: status as ShopOrderStatus,
    customerEmail: typeof row.customer_email === "string" ? row.customer_email : null,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    totalCents: row.total_cents,
    currency: row.currency,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  };
}

/** Order aanmaken in PENDING met server-berekende totalen (nooit client-prijs). */
export async function createPendingOrder(
  sql: ShopSql,
  input: CreatePendingOrderInput,
): Promise<{ orderId: string }> {
  const rows = (await sql`
    INSERT INTO shop_orders (product_id, quantity, unit_price_cents, total_cents, currency)
    VALUES (
      ${input.productId}::uuid,
      ${input.quantity},
      ${input.unitPriceCents},
      ${input.totalCents},
      ${input.currency}
    )
    RETURNING order_id
  `) as { order_id?: unknown }[];
  const orderId = rows[0]?.order_id;
  if (typeof orderId !== "string" || orderId.length === 0) {
    throw new Error("Order insert returned no row.");
  }
  return { orderId };
}

/** Checkout-sessie koppelen (eenmalig: alleen als er nog geen sessie is). */
export async function attachCheckoutSession(
  sql: ShopSql,
  orderId: string,
  sessionId: string,
): Promise<void> {
  await sql`
    UPDATE shop_orders
       SET session_id = ${sessionId}
     WHERE order_id = ${orderId}::uuid
       AND session_id IS NULL
  `;
}

/**
 * Webhook: betaalde sessie → PAID (idempotent). Retourneert null wanneer de
 * sessie onbekend is of de order niet meer PENDING was (al verwerkt).
 */
export async function markOrderPaidBySession(
  sql: ShopSql,
  sessionId: string,
  customerEmail: string | null,
): Promise<{ orderId: string } | null> {
  const rows = (await sql`
    UPDATE shop_orders
       SET status = 'PAID', customer_email = ${customerEmail}
     WHERE session_id = ${sessionId}
       AND status = 'PENDING'
    RETURNING order_id
  `) as { order_id?: unknown }[];
  const orderId = rows[0]?.order_id;
  return typeof orderId === "string" ? { orderId } : null;
}

/** Webhook: verlopen Checkout-sessie → CANCELLED (alleen als nog PENDING). */
export async function markOrderCancelledBySession(
  sql: ShopSql,
  sessionId: string,
): Promise<{ orderId: string } | null> {
  const rows = (await sql`
    UPDATE shop_orders
       SET status = 'CANCELLED'
     WHERE session_id = ${sessionId}
       AND status = 'PENDING'
    RETURNING order_id
  `) as { order_id?: unknown }[];
  const orderId = rows[0]?.order_id;
  return typeof orderId === "string" ? { orderId } : null;
}

/** Checkout-start mislukt (Stripe-fout) → FAILED (alleen als nog PENDING). */
export async function markOrderFailed(
  sql: ShopSql,
  orderId: string,
): Promise<void> {
  await sql`
    UPDATE shop_orders
       SET status = 'FAILED'
     WHERE order_id = ${orderId}::uuid
       AND status = 'PENDING'
  `;
}

/** Status-lookup voor de bevestigingspagina (server-side, nooit client-claims). */
export async function getOrderBySessionId(
  sql: ShopSql,
  sessionId: string,
): Promise<ShopOrder | null> {
  const rows = (await sql`
    SELECT order_id, product_id, session_id, status, customer_email,
           quantity, unit_price_cents, total_cents, currency, created_at
    FROM shop_orders
    WHERE session_id = ${sessionId}
    LIMIT 1
  `) as OrderRow[];
  return mapOrder(rows[0]);
}
