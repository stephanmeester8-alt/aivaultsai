import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPriceCents } from "../lib/shop/format.ts";
import {
  getActiveProductBySlug,
  listActiveProducts,
  mapProduct,
  type ShopSql,
} from "../lib/shop/products.ts";

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

const VALID_ROW: ProductRow = {
  product_id: "11111111-1111-4111-8111-111111111111",
  slug: "ai-assistent-pakket",
  name: "AI-assistent + cursus + persoonlijke onboarding",
  description: "Pakket",
  price_cents: 24900,
  currency: "EUR",
  tax_note: "excl. btw",
  active: true,
};

function makeSql(rows: ProductRow[], listRows?: ProductRow[]): ShopSql {
  return async (strings, ...values) => {
    const text = strings.join("?");
    if (text.includes("FROM shop_products") && text.includes("WHERE active = TRUE")) {
      return listRows ?? rows.filter((r) => r.active);
    }
    if (text.includes("FROM shop_products")) {
      const slug = values[0]; // WHERE slug = ${slug}
      return rows.filter((r) => r.slug === slug);
    }
    return [];
  };
}

test("shop products: mapProduct — geldige rij → product; kapotte rijen fail-closed overgeslagen", () => {
  const product = mapProduct(VALID_ROW);
  assert.equal(product?.slug, "ai-assistent-pakket");
  assert.equal(product?.priceCents, 24900);
  assert.equal(product?.taxNote, "excl. btw");
  assert.equal(product?.active, true);

  // Ongeldige rijen → null (nooit een kapotte prijs tonen).
  assert.equal(mapProduct(undefined), null);
  assert.equal(mapProduct({ ...VALID_ROW, price_cents: 0 }), null);
  assert.equal(mapProduct({ ...VALID_ROW, price_cents: 10.5 }), null); // niet-integer
  assert.equal(mapProduct({ ...VALID_ROW, slug: "" }), null);
  assert.equal(mapProduct({ ...VALID_ROW, name: undefined }), null);
  assert.equal(mapProduct({ ...VALID_ROW, currency: "" }), null);
});

test("shop products: getActiveProductBySlug retourneert alleen actieve producten", async () => {
  const sql = makeSql([VALID_ROW, { ...VALID_ROW, slug: "inactief", active: false }]);
  const found = await getActiveProductBySlug(sql, "ai-assistent-pakket");
  assert.equal(found?.name, "AI-assistent + cursus + persoonlijke onboarding");
  assert.equal(found?.priceCents, 24900);

  // Inactief product is nooit ophaalbaar via de webshop.
  const inactive = await getActiveProductBySlug(sql, "inactief");
  assert.equal(inactive, null);
  assert.equal(await getActiveProductBySlug(sql, "bestaand-niet"), null);
});

test("shop products: listActiveProducts — alleen actieve, geldige producten", async () => {
  const sql = makeSql(
    [VALID_ROW, { ...VALID_ROW, slug: "kapot", price_cents: -5 }, { ...VALID_ROW, slug: "inactief", active: false }],
    [VALID_ROW, { ...VALID_ROW, slug: "inactief", active: false }],
  );
  const products = await listActiveProducts(sql);
  assert.equal(products.length, 1);
  assert.equal(products[0]!.slug, "ai-assistent-pakket");
});

test("shop format: prijsweergave is deterministisch (nl-NL, EUR)", () => {
  assert.equal(formatPriceCents(24900, "EUR"), "€ 249,00");
  assert.equal(formatPriceCents(1000, "EUR"), "€ 10,00");
  assert.equal(formatPriceCents(99, "EUR"), "€ 0,99");
});
