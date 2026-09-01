/**
 * Centrale CRM read-only adapters (TASK 20-design, §5).
 *
 * Fail-closed:
 * - schema-validatie (additionalProperties: false);
 * - tenantId verplicht per call (geen globale calls);
 * - PII-redactie: alleen kernvelden (id/name/email/company/role), bounded;
 *   notities/gesprekshistorie worden NOOIT geretourneerd;
 * - audit met queryHash + count — nooit ruwe contactdata;
 * - client-fout → gecontroleerde fout (geen ongecontroleerde retry);
 * - lead niet gevonden → { lead: null } (geen gok/inventie).
 */

import { createHash } from "node:crypto";

import type { CrmClient, CrmContact } from "../../crm/client.ts";

const NAME_MAX = 200;
const EMAIL_MAX = 320;
const COMPANY_MAX = 200;
const ROLE_MAX = 120;
const SEARCH_TERM_MAX = 200;
const LEAD_ID_MAX = 200;
const LIMIT_MAX = 20;

export interface CrmReadDeps {
  client: CrmClient;
  tenantId: string;
  log?: (message: string) => void;
}

export interface CrmReadAudit {
  queryHash: string;
  count: number;
  truncated: boolean;
}

export interface CrmReadToolResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  audit?: CrmReadAudit;
}

export interface ContactSearchOutput {
  contacts: CrmContact[];
  truncated: boolean;
}

export interface LeadReadOutput {
  lead: {
    id: string;
    company: string | null;
    status: string | null;
    owner: string | null;
    updatedAt: string | null;
  } | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Optioneel nullable veld: afwezig/null → null (ok); ongeldig type, leeg of
 * te lang → undefined (record ongeldig — fail-closed, nooit afkappen).
 */
function nullableField(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return undefined;
  return trimmed;
}

/**
 * PII-redactie: alleen kernvelden, bounded; records zonder id/name/email of
 * met een ongeldig optioneel veld worden overgeslagen (data-hygiëne).
 */
export function sanitizeContact(input: unknown): CrmContact | null {
  if (!isRecord(input)) return null;
  const id = boundString(input.id, LEAD_ID_MAX);
  const name = boundString(input.name, NAME_MAX);
  const email = boundString(input.email, EMAIL_MAX);
  if (!id || !name || !email) return null;
  const company = nullableField(input.company, COMPANY_MAX);
  const role = nullableField(input.role, ROLE_MAX);
  if (company === undefined || role === undefined) return null;
  return { id, name, email, company, role };
}

interface ContactSearchInput {
  q?: string;
  email?: string;
  company?: string;
  limit: number;
}

function validateContactSearch(input: unknown): ContactSearchInput | { error: string } {
  if (!isRecord(input)) return { error: "INVALID_SEARCH_INPUT" };
  const allowed = new Set(["q", "email", "company", "limit"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) return { error: "INVALID_SEARCH_INPUT" };
  }
  const { q, email, company, limit } = input;
  // Zoekterm: optioneel; indien aanwezig: non-empty string ≤ SEARCH_TERM_MAX.
  const validTerm = (value: unknown): string | undefined | null => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.trim().length === 0 || value.length > SEARCH_TERM_MAX) {
      return null; // ongeldig
    }
    return value.trim();
  };
  const qValue = validTerm(q);
  const emailValue = validTerm(email);
  const companyValue = validTerm(company);
  if (qValue === null || emailValue === null || companyValue === null) {
    return { error: "INVALID_SEARCH_INPUT" };
  }
  if (!qValue && !emailValue && !companyValue) {
    return { error: "INVALID_SEARCH_INPUT" }; // anyOf: minstens één zoekterm
  }
  if (limit !== undefined) {
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX) {
      return { error: "INVALID_SEARCH_INPUT" };
    }
  }
  return { q: qValue, email: emailValue, company: companyValue, limit: limit ?? 10 };
}

function validateLeadRead(input: unknown): { leadId: string } | { error: string } {
  if (!isRecord(input)) return { error: "INVALID_LEAD_INPUT" };
  const keys = Object.keys(input);
  if (keys.length !== 1 || !("leadId" in input)) return { error: "INVALID_LEAD_INPUT" };
  const leadId = boundString(input.leadId, LEAD_ID_MAX);
  if (!leadId) return { error: "INVALID_LEAD_INPUT" };
  return { leadId };
}

export async function executeContactSearch(
  input: unknown,
  deps: CrmReadDeps,
): Promise<CrmReadToolResult<ContactSearchOutput>> {
  if (!deps.tenantId || deps.tenantId.trim().length === 0) {
    return { ok: false, error: "TENANT_REQUIRED" };
  }
  const validated = validateContactSearch(input);
  if ("error" in validated) {
    return { ok: false, error: validated.error };
  }

  let contacts: CrmContact[];
  try {
    contacts = await deps.client.searchContacts(
      {
        q: validated.q,
        email: validated.email,
        company: validated.company,
        limit: validated.limit,
      },
      { tenantId: deps.tenantId },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log?.(`[crm:${deps.tenantId}] search failed: ${message.slice(0, 200)}`);
    return { ok: false, error: "CRM_CLIENT_ERROR" };
  }

  const sanitized = contacts.map(sanitizeContact).filter((c): c is CrmContact => c !== null);
  const truncated = sanitized.length > validated.limit;
  const result = sanitized.slice(0, validated.limit);

  const queryHash = sha256(
    JSON.stringify({ q: validated.q, email: validated.email, company: validated.company, limit: validated.limit }),
  );
  return {
    ok: true,
    value: { contacts: result, truncated },
    audit: { queryHash, count: result.length, truncated },
  };
}

export async function executeLeadRead(
  input: unknown,
  deps: CrmReadDeps,
): Promise<CrmReadToolResult<LeadReadOutput>> {
  if (!deps.tenantId || deps.tenantId.trim().length === 0) {
    return { ok: false, error: "TENANT_REQUIRED" };
  }
  const validated = validateLeadRead(input);
  if ("error" in validated) {
    return { ok: false, error: validated.error };
  }

  let lead;
  try {
    lead = await deps.client.getLead(validated.leadId, { tenantId: deps.tenantId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log?.(`[crm:${deps.tenantId}] lead read failed: ${message.slice(0, 200)}`);
    return { ok: false, error: "CRM_CLIENT_ERROR" };
  }

  if (!lead) {
    return {
      ok: true,
      value: { lead: null }, // geen gok: lead bestaat niet (of is niet zichtbaar voor de tenant)
      audit: { queryHash: sha256(validated.leadId), count: 0, truncated: false },
    };
  }
  return {
    ok: true,
    value: { lead: { id: lead.id, company: lead.company, status: lead.status, owner: lead.owner, updatedAt: lead.updatedAt } },
    audit: { queryHash: sha256(validated.leadId), count: 1, truncated: false },
  };
}
