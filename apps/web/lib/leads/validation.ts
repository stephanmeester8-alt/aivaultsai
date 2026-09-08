/**
 * Lead-formulier — server-side validatie (puur en testbaar).
 *
 * Never trust client-side validation: dit is de enige bron van waarheid
 * vóór de database-insert. Fail-closed: onbekende velden, ongeldige
 * waarden of een gevulde honeypot → afgewezen/stil genegeerd.
 */

export const LEAD_SERVICES = [
  "ai-assistent",
  "ai-website",
  "automatisering",
  "anders",
] as const;

export type LeadService = (typeof LEAD_SERVICES)[number];

export interface LeadSubmission {
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  service: LeadService;
  message: string;
  /** Honeypot: normale bezoekers laten dit leeg. */
  website: string;
}

export type LeadValidationResult =
  | { ok: true; data: LeadSubmission }
  | { ok: false; error: "INVALID_INPUT" | "HONEYPOT" };

const NAME_MAX = 200;
const EMAIL_MAX = 320;
const PHONE_MAX = 40;
const COMPANY_MAX = 200;
const MESSAGE_MAX = 4000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function trimmedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function optionalString(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null || value === "") return null; // leeg = afwezig
  if (typeof value !== "string") return undefined; // ongeldig type
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return undefined;
  return trimmed;
}

/**
 * Valideer en normaliseer een onbekende JSON-payload.
 * - email wordt getrimd en naar lowercase genormaliseerd;
 * - service moet op de vaste whitelist staan;
 * - onbekende velden worden afgewezen (additionalProperties = false-gedrag);
 * - gevulde honeypot (website) → { error: "HONEYPOT" } — de caller negeert
 *   de submit stil (geen signaal aan bots).
 */
export function validateLeadInput(input: unknown): LeadValidationResult {
  if (!isRecord(input)) return { ok: false, error: "INVALID_INPUT" };
  const allowed = new Set(["name", "email", "phone", "company", "service", "message", "website"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) return { ok: false, error: "INVALID_INPUT" };
  }

  const website = typeof input.website === "string" ? input.website : "";
  if (website.trim().length > 0) return { ok: false, error: "HONEYPOT" };

  const name = trimmedString(input.name, NAME_MAX);
  if (!name) return { ok: false, error: "INVALID_INPUT" };

  const rawEmail = trimmedString(input.email, EMAIL_MAX);
  if (!rawEmail || !EMAIL_PATTERN.test(rawEmail)) return { ok: false, error: "INVALID_INPUT" };
  const email = rawEmail.toLowerCase();

  const phone = optionalString(input.phone, PHONE_MAX);
  if (phone === undefined) return { ok: false, error: "INVALID_INPUT" };
  const company = optionalString(input.company, COMPANY_MAX);
  if (company === undefined) return { ok: false, error: "INVALID_INPUT" };

  const service = input.service;
  if (typeof service !== "string" || !(LEAD_SERVICES as readonly string[]).includes(service)) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  const message = trimmedString(input.message, MESSAGE_MAX);
  if (!message) return { ok: false, error: "INVALID_INPUT" };

  return {
    ok: true,
    data: { name, email, phone, company, service: service as LeadService, message, website: "" },
  };
}
