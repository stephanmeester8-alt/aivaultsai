/**
 * Webshop — product-repository (read-only voor klanten).
 *
 * Injectable sql (zelfde signature als de andere repositories) zodat tests
 * zonder echte DB draaien. Fail-closed: alleen actieve producten worden
 * getoond; ongeldige rijen worden overgeslagen (nooit een kapotte prijs
 * tonen). Er is GEEN write-pad vanuit de webshop zelf: producten worden
 * alleen door operators/administratie gewijzigd.
 */

import type { ShopProduct } from "./types.ts";

export type ShopSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

interface ProductRow {
  product_id?: unknown;
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  price_cents?: unknown;
  currency?: unknown;
  tax_note?: unknown;
  active?: unknown;
}

/** Fail-closed mapping: alleen volledig geldige rijen worden geretourneerd. */
export function mapProduct(row: ProductRow | undefined): ShopProduct | null {
  if (!row) return null;
  const { product_id: productId, slug, name, description, price_cents: priceCents, currency, tax_note: taxNote, active } = row;
  if (
    typeof productId !== "string" ||
    typeof slug !== "string" ||
    slug.length === 0 ||
    typeof name !== "string" ||
    name.length === 0 ||
    typeof priceCents !== "number" ||
    !Number.isInteger(priceCents) ||
    priceCents <= 0 ||
    typeof currency !== "string" ||
    currency.length === 0
  ) {
    return null;
  }
  return {
    productId,
    slug,
    name,
    description: typeof description === "string" ? description : "",
    priceCents,
    currency,
    taxNote: typeof taxNote === "string" ? taxNote : "",
    active: active === true,
  };
}

export async function listActiveProducts(sql: ShopSql): Promise<ShopProduct[]> {
  const rows = (await sql`
    SELECT product_id, slug, name, description, price_cents, currency, tax_note, active
    FROM shop_products
    WHERE active = TRUE
    ORDER BY name ASC
  `) as ProductRow[];
  const products = rows.map(mapProduct).filter((p): p is ShopProduct => p !== null && p.active);
  return products;
}

export async function getActiveProductBySlug(sql: ShopSql, slug: string): Promise<ShopProduct | null> {
  const rows = (await sql`
    SELECT product_id, slug, name, description, price_cents, currency, tax_note, active
    FROM shop_products
    WHERE slug = ${slug}
    LIMIT 1
  `) as ProductRow[];
  const product = mapProduct(rows[0]);
  return product !== null && product.active ? product : null;
}
