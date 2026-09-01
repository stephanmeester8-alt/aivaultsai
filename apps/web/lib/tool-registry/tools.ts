/**
 * Agent Tool Platform — centrale tool-catalogus (app-laag).
 *
 * Copy-ready ToolSpecs uit de design-docs. Per tool-taak uitbreiden;
 * `email_send` is default DISABLED (send staat nooit automatisch aan).
 */

import { createToolRegistryV2, type ToolRegistryV2 } from "./registry.ts";
import type { ToolSpec } from "./types.ts";

export const ASSISTANT_WEBSITE_RESEARCH: ToolSpec = {
  id: "assistant_website_research",
  name: "Website Research",
  description: "Onderzoek een publieke website (bounded, genormaliseerd, SSRF-beschermd).",
  version: "1.0.0",
  category: "WEB",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
    additionalProperties: false,
  },
  outputSchema: { type: "object" }, // ResearchSummary
  permissions: ["API_REQUEST"],
  class: "READ",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,
  adapter: "http",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 30_000,
  rateLimit: { max: 10, windowMs: 60_000 },
};

export const EMAIL_DRAFT: ToolSpec = {
  id: "email_draft",
  name: "Email Draft",
  description:
    "Stel een outreach-e-maildraft op via de bestaande deterministische generator. " +
    "Verstuurt NOOIT e-mail; de draft wordt idempotent opgeslagen.",
  version: "1.0.0",
  category: "EMAIL",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", minLength: 3, maxLength: 320 },
      companyName: { type: "string", minLength: 1, maxLength: 200 },
      domain: { type: "string", minLength: 1, maxLength: 253 },
      evidenceRefs: { type: "array", items: { type: "string" }, maxItems: 10 },
    },
    required: ["to", "companyName", "domain"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string" },
      subject: { type: "string" },
      body: { type: "string" },
      optOutLine: { type: "string" },
      status: { const: "DRAFT" },
    },
    required: ["draftId", "subject", "body", "optOutLine", "status"],
  },
  permissions: ["EMAIL_DRAFT"],
  class: "WRITE",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,
  adapter: "email-draft",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 5_000,
  rateLimit: { max: 60, windowMs: 60_000 },
};

export const EMAIL_SEND: ToolSpec = {
  id: "email_send",
  name: "Email Send",
  description:
    "Verstuur een goedgekeurde e-maildraft via de fail-closed dispatcher. " +
    "Vereist een APPROVED approval. Default disabled: send staat nooit automatisch aan.",
  version: "1.0.0",
  category: "EMAIL",
  inputSchema: {
    type: "object",
    properties: {
      draftId: { type: "string" },
      approvalId: { type: "string" },
    },
    required: ["draftId", "approvalId"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      status: { enum: ["SENT", "BLOCKED"] },
      reason: { type: ["string", "null"] },
      providerMessageId: { type: ["string", "null"] },
    },
    required: ["status"],
  },
  permissions: ["EMAIL_SEND"],
  class: "EXTERNAL_SIDE_EFFECT",
  riskLevel: "HIGH",
  requiresApproval: true,
  enabled: false, // alleen na expliciete enablement (TASK 19)
  adapter: "email",
  tenantPolicy: "APPROVAL",
  auditEnabled: true,
  timeoutMs: 15_000,
  rateLimit: { max: 20, windowMs: 3_600_000 },
};

export const CONTACT_SEARCH: ToolSpec = {
  id: "contact_search",
  name: "Contact Search",
  description:
    "Zoek CRM-contacten (bounded, tenant-gescoped, PII-bewust). Read-only: " +
    "deze tool kan geen contacten aanmaken of wijzigen.",
  version: "1.0.0",
  category: "CRM",
  inputSchema: {
    type: "object",
    properties: {
      q: { type: "string", maxLength: 200 },
      email: { type: "string", maxLength: 320 },
      company: { type: "string", maxLength: 200 },
      limit: { type: "integer", minimum: 1, maximum: 20 },
    },
    anyOf: [{ required: ["q"] }, { required: ["email"] }, { required: ["company"] }],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      contacts: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string", maxLength: 200 },
            email: { type: "string", maxLength: 320 },
            company: { type: ["string", "null"], maxLength: 200 },
            role: { type: ["string", "null"], maxLength: 120 },
          },
          required: ["id", "name", "email"],
        },
      },
      truncated: { type: "boolean" },
    },
    required: ["contacts", "truncated"],
  },
  permissions: ["CRM_READ"],
  class: "READ",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,
  adapter: "crm",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 10_000,
  rateLimit: { max: 60, windowMs: 60_000 },
};

export const LEAD_READ: ToolSpec = {
  id: "lead_read",
  name: "Lead Read",
  description: "Lees één CRM-lead op id (bounded, tenant-gescoped). Read-only.",
  version: "1.0.0",
  category: "CRM",
  inputSchema: {
    type: "object",
    properties: { leadId: { type: "string", minLength: 1, maxLength: 200 } },
    required: ["leadId"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      lead: {
        type: ["object", "null"],
        properties: {
          id: { type: "string" },
          company: { type: ["string", "null"], maxLength: 200 },
          status: { type: ["string", "null"], maxLength: 60 },
          owner: { type: ["string", "null"], maxLength: 120 },
          updatedAt: { type: ["string", "null"] },
        },
        required: ["id"],
      },
    },
    required: ["lead"],
  },
  permissions: ["CRM_READ"],
  class: "READ",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,
  adapter: "crm",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 10_000,
  rateLimit: { max: 120, windowMs: 60_000 },
};

export const CALENDAR_READ: ToolSpec = {
  id: "calendar_read",
  name: "Calendar Read",
  description:
    "Lees beschikbaarheid (slots) via de gekoppelde calendar-provider. " +
    "Read-only: maakt nooit afspraken en annuleert niets.",
  version: "1.0.0",
  category: "CALENDAR",
  inputSchema: {
    type: "object",
    properties: {
      startDate: { type: "string" },
      endDate: { type: "string" },
      timezone: { type: "string", maxLength: 64 },
      durationMinutes: { type: "integer", minimum: 15, maximum: 240 },
    },
    required: ["startDate", "endDate", "timezone", "durationMinutes"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      available: { type: "boolean" },
      slots: {
        type: "array",
        maxItems: 50,
        items: {
          type: "object",
          properties: {
            start: { type: "string" },
            end: { type: "string" },
            timezone: { type: "string" },
          },
          required: ["start", "end", "timezone"],
        },
      },
      provider: { type: "string" },
      reason: { type: ["string", "null"], maxLength: 200 },
    },
    required: ["available", "slots", "provider", "reason"],
  },
  permissions: ["CALENDAR_READ"],
  class: "READ",
  riskLevel: "LOW",
  requiresApproval: false,
  enabled: true,
  adapter: "calendar",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 10_000,
  rateLimit: { max: 60, windowMs: 60_000 },
};

/** Volledige catalogus — registratievolgorde = stabiele lijstvolgorde. */
export const TOOL_SPECS: readonly ToolSpec[] = [
  ASSISTANT_WEBSITE_RESEARCH,
  EMAIL_DRAFT,
  EMAIL_SEND,
  CONTACT_SEARCH,
  LEAD_READ,
  CALENDAR_READ,
];

export function createDefaultToolRegistry(): ToolRegistryV2 {
  return createToolRegistryV2(TOOL_SPECS);
}
