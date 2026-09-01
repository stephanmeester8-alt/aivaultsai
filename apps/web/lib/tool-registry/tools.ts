/**
 * Agent Tool Platform — centrale tool-catalogus (app-laag).
 *
 * Copy-ready ToolSpecs uit de design-docs. Per tool-taak uitbreiden;
 * `email_send` is default DISABLED (send staat nooit automatisch aan).
 */

import { createToolRegistryV2, type ToolRegistryV2 } from "./registry.ts";
import type { DiscoveryAgent } from "./discovery.ts";
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
  keywords: ["website", "research", "onderzoek", "url", "website-research"],
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
  keywords: ["email", "draft", "concept", "outreach", "e-mail"],
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
  keywords: ["email", "send", "versturen", "mail", "e-mail"],
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
  keywords: ["crm", "contact", "zoeken", "search", "klant"],
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
  keywords: ["crm", "lead", "lezen", "read"],
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
  keywords: ["calendar", "agenda", "beschikbaarheid", "slots", "afspraak"],
};

export const EMPLOYEE_DISCOVERY: ToolSpec = {
  id: "employee_discovery",
  name: "Employee Discovery",
  description: "Validateer en dedupliceer kandidaten voor een employee-sessie (geen externe side effect).",
  version: "1.0.0",
  category: "WEB",
  inputSchema: {
    type: "object",
    properties: {
      companies: { type: "array", items: { type: "object" } },
      limit: { type: "integer", minimum: 1, maximum: 10 },
    },
    required: ["companies"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      companies: { type: "array" },
      rejected: { type: "array" },
    },
    required: ["companies", "rejected"],
  },
  permissions: ["DATABASE_READ"],
  class: "READ",
  riskLevel: "LOW",
  requiresApproval: false,
  enabled: true,
  adapter: "employee-prospect",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 5_000,
  rateLimit: null,
  keywords: ["discovery", "kandidaten", "dedupe", "prospects"],
};

export const EMPLOYEE_WEBSITE_RESEARCH: ToolSpec = {
  id: "employee_website_research",
  name: "Employee Website Research",
  description: "Beveiligde website-research + deterministische AI-detectie in één tool (geen fetch zonder detectie-policy).",
  version: "1.0.0",
  category: "WEB",
  inputSchema: {
    type: "object",
    properties: {
      websiteUrl: { type: "string" },
      domain: { type: "string" },
    },
    required: ["websiteUrl", "domain"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      research: { type: "object" },
      detection: { type: ["object", "null"] },
    },
    required: ["research", "detection"],
  },
  permissions: ["API_REQUEST"],
  class: "READ",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,
  adapter: "employee-research",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 30_000,
  rateLimit: { max: 60, windowMs: 60_000 },
  keywords: ["website", "research", "onderzoek", "url"],
};

export const EMPLOYEE_QUALIFY: ToolSpec = {
  id: "employee_qualify",
  name: "Employee Qualify",
  description: "Bestaande prospect-scoring + route-matching (deterministisch, geen tweede engine).",
  version: "1.0.0",
  category: "AI",
  inputSchema: {
    type: "object",
    properties: {
      prospect: { type: "object" },
      intelligence: { type: "object" },
    },
    required: ["prospect", "intelligence"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      score: { type: "object" },
      route: { type: "string" },
    },
    required: ["score", "route"],
  },
  permissions: ["DATABASE_READ"],
  class: "READ",
  riskLevel: "LOW",
  requiresApproval: false,
  enabled: true,
  adapter: "employee-prospect",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 5_000,
  rateLimit: null,
  keywords: ["qualify", "kwalificatie", "score", "scoring", "prospect"],
};

export const EMPLOYEE_DATABASE_READ: ToolSpec = {
  id: "employee_database_read",
  name: "Employee Database Read",
  description: "Lees employee-run-data (opgeslagen research/kandidaten) — interne DB-toegang via de registry.",
  version: "1.0.0",
  category: "DATABASE",
  inputSchema: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"] },
  outputSchema: { type: "object" },
  permissions: ["DATABASE_READ"],
  class: "READ",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,
  adapter: "employee-db",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 5_000,
  rateLimit: null,
  keywords: ["database", "db", "lezen"],
};

export const EMPLOYEE_DATABASE_WRITE: ToolSpec = {
  id: "employee_database_write",
  name: "Employee Database Write",
  description: "Persisteer employee-run-data (upsert company/research) — interne DB-toegang via de registry.",
  version: "1.0.0",
  category: "DATABASE",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      domain: { type: "string" },
      discoverySource: { type: "string" },
    },
    required: ["name", "domain", "discoverySource"],
    additionalProperties: false,
  },
  outputSchema: { type: "object" },
  permissions: ["DATABASE_WRITE"],
  class: "WRITE",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,
  adapter: "employee-db",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 5_000,
  rateLimit: null,
  keywords: ["database", "db", "schrijven", "opslaan"],
};

/**
 * Employee-agent-definitie (TASK 15 §4): de vastgelegde tool-set van de
 * Autonomous Employee. email_send staat er BEWUST niet in (dubbel slot:
 * prohibitedPermissions + niet in allowedTools) — alleen via approval-poort.
 */
export const EMPLOYEE_ALLOWED_TOOLS: readonly string[] = [
  "employee_discovery",
  "employee_website_research",
  "employee_qualify",
  "employee_database_read",
  "employee_database_write",
  "email_draft", // centrale draft-tool (TASK 18 vervangt employee_outreach_draft)
];

export const EMPLOYEE_AGENT: DiscoveryAgent = {
  id: "autonomous-employee",
  riskLevel: "MEDIUM",
  allowedTools: EMPLOYEE_ALLOWED_TOOLS,
  allowedPermissions: ["API_REQUEST", "DATABASE_READ", "DATABASE_WRITE", "EMAIL_DRAFT"],
};

/** Volledige catalogus — registratievolgorde = stabiele lijstvolgorde. */
export const TOOL_SPECS: readonly ToolSpec[] = [
  ASSISTANT_WEBSITE_RESEARCH,
  EMAIL_DRAFT,
  EMAIL_SEND,
  CONTACT_SEARCH,
  LEAD_READ,
  CALENDAR_READ,
  EMPLOYEE_DISCOVERY,
  EMPLOYEE_WEBSITE_RESEARCH,
  EMPLOYEE_QUALIFY,
  EMPLOYEE_DATABASE_READ,
  EMPLOYEE_DATABASE_WRITE,
];

export function createDefaultToolRegistry(): ToolRegistryV2 {
  return createToolRegistryV2(TOOL_SPECS);
}
