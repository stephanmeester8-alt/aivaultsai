/**
 * Prospect Acquisition Pipeline — normalisatie (pure, testbaar).
 *
 * Normaliseer e-mailadressen en domeinen VOORDAT duplicaten worden
 * gecontroleerd (vereiste). Normalisatie is bewust conservatief:
 *  - e-mail: trim + lowercase (geen foutherstel van typefouten);
 *  - domein: uit e-mail of website gehaald, lowercase, zonder scheme/www/poort.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normaliseer een e-mailadres; retourneert null bij ongeldig/leeg. */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 320) return null;
  if (!EMAIL_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/** Haal het domein uit een genormaliseerd e-mailadres (achter de @). */
export function domainFromEmail(emailNormalized: string): string | null {
  const at = emailNormalized.indexOf("@");
  if (at <= 0 || at === emailNormalized.length - 1) return null;
  const domain = emailNormalized.slice(at + 1);
  return domain.length > 0 && domain.length <= 253 ? domain : null;
}

/** Haal het registreerbare domein uit een website-URL (https/http of kaal). */
export function domainFromWebsite(website: string | null | undefined): string | null {
  if (typeof website !== "string") return null;
  const trimmed = website.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  let hostname: string;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      hostname = new URL(trimmed).hostname;
    } else {
      hostname = new URL(`https://${trimmed}`).hostname;
    }
  } catch {
    return null;
  }

  hostname = hostname.replace(/^www\./, "");
  // IP-adressen en localhost zijn geen nuttige prospect-domeinen.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return null;
  if (hostname === "localhost" || hostname.endsWith(".local")) return null;
  if (!hostname.includes(".")) return null;
  return hostname;
}

/** Normaliseer een website-URL voor opslag (alleen http/https). */
export function normalizeWebsite(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url.origin + (url.pathname === "/" ? "" : url.pathname);
}

/** Bepaal het beste domein voor een prospect (e-mail wint, anders website). */
export function resolveDomainNormalized(input: {
  emailNormalized: string | null;
  website: string | null | undefined;
}): string | null {
  if (input.emailNormalized) {
    const fromEmail = domainFromEmail(input.emailNormalized);
    if (fromEmail) return fromEmail;
  }
  const fromWebsite = domainFromWebsite(input.website);
  if (fromWebsite) return fromWebsite;
  return null;
}
