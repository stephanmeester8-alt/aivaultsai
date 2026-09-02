/**
 * Webshop — gedeelde types (shop).
 *
 * Fase 1 = catalogus + productselectie: alleen producten. Betalingen zijn
 * BEWUST buiten scope (payments: intentionally not implemented); zodra een
 * payment provider wordt gekozen, komt er een aparte order-/payment-laag
 * achter een abstracte PaymentProvider-interface bij.
 *
 * Prijzen leven ALTIJD in de database (price_cents); de UI toont alleen
 * wat de database levert — er is geen pad waarlangs een client een prijs
 * kan aanleveren.
 */

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
