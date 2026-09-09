/**
 * Digital Employee — eerste productie-skills (Sprint 2).
 *
 * Drie expliciete skills bovenop de Sprint 1-contracten. Geen LLM-router:
 * deterministische routing via expliciete contracts. Skills roepen tools
 * uitsluitend aan via context.tools (router-gateway); lead.capture schrijft
 * via de BESTAANDE leads-domeinservice (lib/leads/submit.ts) — er is nog
 * geen lead-tool in de catalogus, dus interne service binnen dezelfde
 * router-pipeline (policy/risk/approval/recorder op skill-niveau).
 *
 *   customer.inquiry  R1  analyseert commercieel intent (rule-based,
 *                         bestaande detectCommercialIntent), geen writes
 *   company.research  R1  leest één website via assistant_website_research
 *   lead.capture      R2  interne opslag via contact_leads + notificatie
 */

import { detectCommercialIntent } from "../customer-zero/commercial-intent.ts";
import type { LeadNotifier } from "../leads/notify.ts";
import { submitLead } from "../leads/submit.ts";
import { LEAD_SERVICES } from "../leads/validation.ts";
import type { LeadsSql } from "../leads/repository.ts";
import type { AgentSkill } from "./types.ts";

// ---- customer.inquiry -----------------------------------------------------

export function createCustomerInquirySkill(): AgentSkill {
  return {
    id: "customer.inquiry",
    version: "1.0.0",
    description:
      "Analyseert een klantvraag en bepaalt of er commercieel intent is (rule-based, geen externe acties).",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", minLength: 1, maxLength: 2000 },
      },
      required: ["question"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    permissions: [],
    allowedTools: [],
    riskClass: "R1",
    approvalPolicy: "AUTO",
    async execute(context, input) {
      const question = (input as { question: string }).question;
      const intent = detectCommercialIntent([{ role: "user", content: question }]);
      const nextBestAction = !intent.detected
        ? "answer"
        : intent.level === "HIGH_COMMERCIAL_INTENT"
          ? "lead_capture"
          : "answer_and_capture";
      return {
        ok: true,
        value: {
          question,
          commercialIntent: intent.detected,
          level: intent.level,
          score: intent.score,
          reasons: intent.reasons,
          nextBestAction,
        },
      };
    },
  };
}

// ---- company.research ------------------------------------------------------

export function createCompanyResearchSkill(): AgentSkill {
  return {
    id: "company.research",
    version: "1.0.0",
    description:
      "Onderzoekt één publieke website via de read-only research-tool (SSRF-guarded). Geen writes.",
    inputSchema: {
      type: "object",
      properties: {
        websiteUrl: { type: "string", minLength: 1, maxLength: 2000 },
      },
      required: ["websiteUrl"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    permissions: ["API_REQUEST"],
    allowedTools: ["assistant_website_research"],
    riskClass: "R1",
    approvalPolicy: "AUTO",
    async execute(context, input) {
      if (!context.tools) return { ok: false, error: "TOOL_NOT_IMPLEMENTED" };
      const websiteUrl = (input as { websiteUrl: string }).websiteUrl;
      const result = await context.tools.execute("assistant_website_research", { url: websiteUrl });
      if (!result.ok) return { ok: false, error: result.error ?? "EXECUTION_FAILED" };
      return { ok: true, value: result.value };
    },
  };
}

// ---- lead.capture ----------------------------------------------------------

export interface LeadCaptureSkillDeps {
  sql: LeadsSql;
  notifier?: LeadNotifier | null;
}

export function createLeadCaptureSkill(deps: LeadCaptureSkillDeps): AgentSkill {
  return {
    id: "lead.capture",
    version: "1.0.0",
    description:
      "Slaat een gekwalificeerde lead op via de bestaande leads-domeinservice (interne opslag + notificatie).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 200 },
        email: { type: "string", minLength: 3, maxLength: 320 },
        phone: { type: "string", maxLength: 40 },
        company: { type: "string", maxLength: 200 },
        service: { type: "string", enum: [...LEAD_SERVICES] },
        message: { type: "string", minLength: 1, maxLength: 4000 },
      },
      required: ["name", "email", "service", "message"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    permissions: ["DATABASE_WRITE"],
    allowedTools: [],
    riskClass: "R2",
    approvalPolicy: "AUTO",
    async execute(context, input) {
      const data = input as {
        name: string;
        email: string;
        phone?: string | null;
        company?: string | null;
        service: (typeof LEAD_SERVICES)[number];
        message: string;
      };
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(data.email)) return { ok: false, error: "INVALID_INPUT" };

      const result = await submitLead(
        {
          tenantId: context.tenantId, // router-invariant: NO TENANT = NO EXECUTION
          sql: deps.sql,
          notifier: deps.notifier ?? null,
          now: context.now,
          log: context.log,
        },
        {
          name: data.name,
          email: data.email.toLowerCase(),
          phone: data.phone ?? null,
          company: data.company ?? null,
          service: data.service,
          message: data.message,
          website: "", // geen honeypot-pad binnen skills
        },
      );
      if (!result.ok) return { ok: false, error: "STORAGE_FAILED" };
      return { ok: true, value: { leadId: result.leadId ?? null } };
    },
  };
}
