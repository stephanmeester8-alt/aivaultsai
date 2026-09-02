/**
 * Webshop — gedeelde types (shop).
 *
 * Prijzen leven ALTIJD in de database (price_cents); de browser levert
 * nooit een prijs. Orderstatus komt ALLEEN uit de geverifieerde
 * Stripe-webhook (PENDING → PAID/CANCELLED/FAILED).
 */

export type ShopOrderStatus = "PENDING" | "PAID" | "CANCELLED" | "FAILED";

export interface ShopProduct {
  productId: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  taxNote: string;
  active: boolean;
}

export interface ShopOrder {
  orderId: string;
  productId: string;
  sessionId: string | null;
  status: ShopOrderStatus;
  customerEmail: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  currency: string;
  createdAt: string;
}
