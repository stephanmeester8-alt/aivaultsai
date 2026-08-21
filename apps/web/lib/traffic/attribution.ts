/**
 * Organic attribution parsing, sanitization and source classification.
 *
 * Client input is fully untrusted: everything is validated server-side,
 * sanitized to a strict whitelist, and treated as data (never as HTML or
 * instructions). Malformed input can never fail the assistant request.
 */

export const ATTRIBUTION_KEYS = [
  "landing_page",
  "referrer_origin",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "gclid",
  "first_touch_source",
  "first_touch_medium",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type Attribution = Partial<Record<AttributionKey, string>>;

export const MAX_ATTRIBUTION_VALUE_LENGTH = 500;
const MAX_URL_LENGTH = 2048;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export type SourceClassification =
  | "paid"
  | "organic"
  | "social"
  | "email"
  | "referral"
  | "direct"
  | "unknown";

const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid"]);
const ORGANIC_HOSTS = [/(^|\.)google\./i, /(^|\.)bing\./i];
const SOCIAL_HOSTS = [/(^|\.)t\.co$/i, /facebook\./i, /instagram\./i, /linkedin\./i];

function tryParseUrl(value: string, base?: string): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

function cap(value: string): string {
  return value.slice(0, MAX_ATTRIBUTION_VALUE_LENGTH);
}

/** Sanitize a single whitelisted value; returns null when it must be dropped. */
export function sanitizeAttributionValue(key: AttributionKey, raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (value.length > MAX_URL_LENGTH && (key === "referrer_origin" || key === "landing_page")) {
    return null;
  }

  if (key === "referrer_origin") {
    // Keep only origin + path; strip query/fragment (may contain PII).
    const parsed = tryParseUrl(value);
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return null;
    return cap(`${parsed.origin}${parsed.pathname}`);
  }

  if (key === "landing_page") {
    // Relative path preferred; absolute URLs reduced to their pathname.
    const parsed = tryParseUrl(value, "https://www.aivaultsai.one");
    if (!parsed) return null;
    return cap(parsed.pathname);
  }

  // utm_* / gclid: plain string data, control chars removed.
  return cap(value.replace(CONTROL_CHARS, ""));
}

/**
 * Extract and sanitize attribution from an untrusted client payload.
 * Unknown keys and invalid values are dropped. Never throws.
 */
export function parseClientAttribution(raw: unknown): Attribution {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const result: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = record[key];
    if (typeof value !== "string") continue;
    const cleaned = sanitizeAttributionValue(key, value);
    if (cleaned !== null) result[key] = cleaned;
  }
  return result;
}

/**
 * Deterministic source classification. Priority order (tested):
 * 1. gclid present            -> paid
 * 2. utm_medium cpc|ppc|paid  -> paid
 * 3. utm_medium organic       -> organic
 * 4. utm_medium social        -> social
 * 5. utm_medium email         -> email
 * 6. referrer google.*|bing.* -> organic
 * 7. referrer social hosts    -> social
 * 8. other external referrer  -> referral
 * 9. no referrer + no medium  -> direct
 * else                        -> unknown
 */
export function classifySource(
  referrer: string | null | undefined,
  utmMedium: string | null | undefined,
  hasGclid: boolean,
): SourceClassification {
  if (hasGclid) return "paid";

  const medium = utmMedium?.trim().toLowerCase();
  if (medium && PAID_MEDIUMS.has(medium)) return "paid";
  if (medium === "organic") return "organic";
  if (medium === "social") return "social";
  if (medium === "email") return "email";

  if (referrer) {
    const parsed = tryParseUrl(referrer);
    const host = parsed?.hostname ?? "";
    if (host && ORGANIC_HOSTS.some((pattern) => pattern.test(host))) return "organic";
    if (host && SOCIAL_HOSTS.some((pattern) => pattern.test(host))) return "social";
    if (host) return "referral";
  }

  if (!referrer && !medium) return "direct";
  return "unknown";
}

/**
 * First-touch semantics: an existing first_touch_* value is never
 * overwritten by a later capture.
 */
export function mergeFirstTouch(existing: Attribution, incoming: Attribution): Attribution {
  const merged: Attribution = { ...incoming };
  for (const key of ["first_touch_source", "first_touch_medium"] as const) {
    if (existing[key]) merged[key] = existing[key];
  }
  return merged;
}

/** Attribution is captured only when a conversation is being created. */
export function shouldCaptureAttribution(conversationIdProvided: boolean): boolean {
  return !conversationIdProvided;
}
