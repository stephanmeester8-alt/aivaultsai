/**
 * Autonomous Employee â€” explicit tools (TASK FASE 3).
 *
 * The employee works ONLY through these tools. Every tool:
 * - validates its input (fail closed)
 * - passes a permission/policy check
 * - produces a structured, auditable result
 * - is idempotent or keyed, so re-runs are safe
 *
 * Tools wrap the EXISTING Prospect Run functions; no parallel pipeline.
 */

import { checkPermission, type EmployeePermission } from "./policy.ts";
import type { EmployeeToolContext } from "./types.ts";
import type { DiscoveredCompany } from "../prospect-run/discovery.ts";
import type { WebsiteResearchResult } from "../prospect-run/website-research.ts";
import type { AiDetectionResult } from "../prospect-run/ai-detection.ts";
import type {
  ProspectInput,
  ProspectIntelligence,
  PropensityScore,
  SalesRoute,
} from "../prospect-run/types.ts";

/** Policy result enriched with the permission it was checked against. */
function policyFor(permission: EmployeePermission) {
  const result = checkPermission(permission);
  return { permission, allowed: result.allowed, reason: result.reason };
}

export interface ToolResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  /** Policy decision recorded for the audit trail. */
  policy: { permission: EmployeePermission; allowed: boolean; reason?: string };
}

export interface DiscoverToolInput {
  companies: readonly DiscoveredCompany[];
  limit: number;
}
export interface DiscoverToolOutput {
  companies: DiscoveredCompany[];
  rejected: Array<{ company: string; reason: string }>;
}

export interface ResearchToolInput {
  websiteUrl: string;
  domain: string;
}
export interface ResearchToolOutput {
  research: WebsiteResearchResult;
  detection: AiDetectionResult | null;
}

export interface QualifyToolInput {
  prospect: ProspectInput;
  intelligence: ProspectIntelligence;
}
export interface QualifyToolOutput {
  score: PropensityScore;
  route: SalesRoute;
}

function validateCompaniesInput(input: unknown): DiscoverToolInput | null {
  if (!input || typeof input !== "object") return null;
  const value = input as { companies?: unknown; limit?: unknown };
  if (!Array.isArray(value.companies)) return null;
  const limit = typeof value.limit === "number" && value.limit > 0 ? value.limit : 5;
  return { companies: value.companies as DiscoveredCompany[], limit: Math.min(limit, 10) };
}

/**
 * discoverProspects: validate + dedupe raw candidates (no external side
 * effect; the provider list is passed in by the operator/session config).
 */
export async function discoverProspects(
  input: unknown,
  ctx: EmployeeToolContext,
): Promise<ToolResult<DiscoverToolOutput>> {
  const policy = policyFor("discovery.read");
  if (!policy.allowed) return { ok: false, error: policy.reason, policy };

  const validated = validateCompaniesInput(input);
  if (!validated) return { ok: false, error: "INVALID_DISCOVER_INPUT", policy };

  const { dedupeCompanies, validateCompanies } = await import("../prospect-run/discovery.ts");
  const { valid, rejected } = validateCompanies(validated.companies);
  const companies = dedupeCompanies(valid).slice(0, validated.limit);
  ctx.log?.(`[employee:${ctx.tenantId}] discoverProspects: ${companies.length} candidates after dedupe`);
  return {
    ok: true,
    value: { companies, rejected: rejected.map((r) => ({ company: r.company.name, reason: r.reason })) },
    policy,
  };
}

function validateResearchInput(input: unknown): ResearchToolInput | null {
  if (!input || typeof input !== "object") return null;
  const value = input as { websiteUrl?: unknown; domain?: unknown };
  if (typeof value.websiteUrl !== "string" || typeof value.domain !== "string") return null;
  return { websiteUrl: value.websiteUrl, domain: value.domain };
}

/**
 * researchWebsite + detectAiAssistant: guarded fetch and deterministic
 * detection, one tool so no agent step can fetch without detection policy.
 */
export async function researchCompanyWebsite(
  input: unknown,
  ctx: EmployeeToolContext,
): Promise<ToolResult<ResearchToolOutput>> {
  const policy = policyFor("website.research");
  if (!policy.allowed) return { ok: false, error: policy.reason, policy };

  const validated = validateResearchInput(input);
  if (!validated) return { ok: false, error: "INVALID_RESEARCH_INPUT", policy };

  const { researchWebsite } = await import("../prospect-run/website-research.ts");
  const { detectAiAssistant } = await import("../prospect-run/ai-detection.ts");

  const research = await researchWebsite(validated.websiteUrl, {
    fetchImpl: ctx.fetchImpl,
    lookup: ctx.lookup,
    now: ctx.now,
  });
  ctx.log?.(
    `[employee:${ctx.tenantId}] researchCompanyWebsite: ${validated.domain} -> HTTP ${research.httpStatus ?? "n/a"} (${research.status})`,
  );

  let detection: AiDetectionResult | null = null;
  if (research.status === "ok" && research.html) {
    detection = detectAiAssistant(research.html, research.url);
    ctx.log?.(
      `[employee:${ctx.tenantId}] detectAiAssistant: ${validated.domain} -> ${detection.status} (${detection.confidence})`,
    );
  }
  return { ok: true, value: { research, detection }, policy };
}

function validateQualifyInput(input: unknown): QualifyToolInput | null {
  if (!input || typeof input !== "object") return null;
  const value = input as { prospect?: unknown; intelligence?: unknown };
  if (!value.prospect || typeof value.prospect !== "object") return null;
  if (!value.intelligence || typeof value.intelligence !== "object") return null;
  return {
    prospect: value.prospect as ProspectInput,
    intelligence: value.intelligence as ProspectIntelligence,
  };
}

/**
 * qualifyProspect: existing scoring + route matching (no second engine).
 */
export async function qualifyProspect(
  input: unknown,
  ctx: EmployeeToolContext,
): Promise<ToolResult<QualifyToolOutput>> {
  const policy = policyFor("database.read");
  if (!policy.allowed) return { ok: false, error: policy.reason, policy };

  const validated = validateQualifyInput(input);
  if (!validated) return { ok: false, error: "INVALID_QUALIFY_INPUT", policy };

  const { scoreProspect, matchSalesRoute } = await import("../prospect-run/scoring.ts");
  const score = scoreProspect(validated.intelligence);
  const route = matchSalesRoute(validated.intelligence);
  ctx.log?.(`[employee:${ctx.tenantId}] qualifyProspect: score ${score.total}, route ${route}`);
  return {
    ok: true,
    value: { score, route },
    policy,
  };
}

/**
 * createOutreachDraft: existing draft generator; drafts are NEVER sent by
 * this tool â€” sending goes through the approval gate + email dispatcher.
 */
export async function createOutreachDraft(
  input: unknown,
  ctx: EmployeeToolContext,
): Promise<ToolResult<{ subject: string; body: string; optOutLine: string }>> {
  const policy = policyFor("outreach.draft");
  if (!policy.allowed) return { ok: false, error: policy.reason, policy };

  const validated = validateQualifyInput(input);
  if (!validated) return { ok: false, error: "INVALID_DRAFT_INPUT", policy };

  const { draftOutreach } = await import("../prospect-run/prospect-agent.ts");
  const draft = draftOutreach(validated.prospect, validated.intelligence);
  ctx.log?.(`[employee:${ctx.tenantId}] createOutreachDraft: subject "${draft.subject.slice(0, 60)}"`);
  return { ok: true, value: draft, policy };
}

/** Email send is structurally impossible without approval (policy DENY). */
export async function sendEmail(): Promise<ToolResult<never>> {
  const policy = policyFor("email.send");
  return { ok: false, error: policy.reason, policy };
}
