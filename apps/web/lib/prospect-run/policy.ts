import { createHash } from "node:crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isVerifiedBusinessEmail(value: string | undefined): value is string {
  return Boolean(value && EMAIL_RE.test(value) && value.length <= 320);
}

export function hashRecipient(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** Strip direct identifiers from AI-bound context. */
export function sanitizeIntelligenceContext(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/\+?[\d][\d .()-]{7,}[\d]/g, "[redacted-phone]");
}

export function renderTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/{{([A-Z0-9_]+)}}/g, (_match, key: string) => {
    const value = values[key];
    return value === undefined ? "" : String(value);
  });
}

export function dispatchAllowed(input: {
  email?: string;
  optedOut: boolean;
  warmedUp: boolean;
  rateAllowed: boolean;
  autoSendEnabled: boolean;
}): { allowed: boolean; reason?: string } {
  if (!isVerifiedBusinessEmail(input.email)) return { allowed: false, reason: "VERIFIED_BUSINESS_EMAIL_REQUIRED" };
  if (input.optedOut) return { allowed: false, reason: "RECIPIENT_OPTED_OUT" };
  if (!input.warmedUp) return { allowed: false, reason: "SENDING_DOMAIN_NOT_WARMED" };
  if (!input.rateAllowed) return { allowed: false, reason: "RATE_LIMITED" };
  if (!input.autoSendEnabled) return { allowed: false, reason: "HITL_REVIEW_REQUIRED" };
  return { allowed: true };
}
