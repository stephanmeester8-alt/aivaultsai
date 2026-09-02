"use server";

/**
 * Webshop — server action: checkout starten.
 *
 * Server Actions hebben ingebouwde CSRF-bescherming (Origin-check door
 * Next.js). De prijs komt uit de DB (startCheckout); de browser stuurt
 * alleen de product-slug. Redirect naar Stripe Checkout of terug naar de
 * productpagina met een foutmarkering.
 */

import { redirect } from "next/navigation";

import { sql } from "@/lib/db/client";
import { getShopBaseUrl, getStripeSecretKey } from "@/lib/shop/config";
import { createStripeClient } from "@/lib/shop/stripe";
import { startCheckout } from "@/lib/shop/checkout";

const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;

export async function checkoutProductAction(formData: FormData): Promise<void> {
  const rawSlug = formData.get("slug");
  const slug = typeof rawSlug === "string" ? rawSlug.trim() : "";
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error("INVALID_PRODUCT_SLUG");
  }

  const secretKey = getStripeSecretKey();
  const result = await startCheckout(
    {
      sql,
      stripe: secretKey ? createStripeClient(secretKey) : null,
      baseUrl: getShopBaseUrl(),
    },
    slug,
  );

  if (!result.ok) {
    const reason = result.error === "NOT_CONFIGURED" ? "niet-geconfigureerd" : "mislukt";
    redirect(`/shop/${encodeURIComponent(slug)}?checkout=${reason}`);
  }
  redirect(result.redirectUrl);
}
