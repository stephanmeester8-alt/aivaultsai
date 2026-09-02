/**
 * Webshop — server-only configuratie.
 *
 * Geen secrets in client-code: deze module wordt alleen door server
 * code geïmporteerd (server actions, route handlers, repositories).
 * Ontbrekende keys → expliciete null/fout; nooit fallback naar een
 * testwaarde in productie-code.
 */

import { SITE_URL } from "@/lib/site";

export function getStripeSecretKey(): string | null {
  const value = process.env.STRIPE_SECRET_KEY;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getStripeWebhookSecret(): string | null {
  const value = process.env.STRIPE_WEBHOOK_SECRET;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Publieke basis-URL voor Stripe redirects (success/cancel).
 * Default: de productie-URL; overschrijfbaar voor preview-omgevingen
 * via SHOP_BASE_URL (bijv. een Vercel preview-URL).
 */
export function getShopBaseUrl(): string {
  const value = process.env.SHOP_BASE_URL;
  return typeof value === "string" && value.length > 0 ? value : SITE_URL;
}
