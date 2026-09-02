/**
 * Webshop — prijsweergave.
 *
 * Prijs komt ALTIJD uit de database (price_cents); deze functie formatteert
 * alleen. "excl. btw" komt uit product.taxNote (alleen tonen als die er is).
 */

export function formatPriceCents(priceCents: number, currency: string): string {
  const amount = (priceCents / 100).toLocaleString("nl-NL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount;
}
