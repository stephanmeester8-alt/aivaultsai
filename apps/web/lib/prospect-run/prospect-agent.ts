import { randomUUID } from "node:crypto";
import { matchSalesRoute, scoreProspect } from "./scoring.ts";
import { isVerifiedBusinessEmail, renderTemplate, sanitizeIntelligenceContext } from "./policy.ts";
import type {
  DispatchMode,
  OutreachDraft,
  ProspectInput,
  ProspectIntelligence,
  ProspectRunResult,
  RunManifest,
} from "./types.ts";

export interface ProspectAgentDeps {
  claimRun(runId: string): Promise<boolean>;
  persistManifest(manifest: RunManifest): Promise<void>;
  analyze(input: ProspectInput): Promise<ProspectIntelligence>;
  now?: () => string;
}

function bounded(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.min(100, Math.round(value ?? fallback)));
}

/** Safe fallback when an intelligence provider is unavailable. It never invents evidence. */
export function inferProspectIntelligence(input: ProspectInput): ProspectIntelligence {
  const pains = input.knownPainPoints ?? [];
  const evidence = [...(input.publicSignals ?? []), ...(input.crmSignals ?? [])];
  const unknowns: string[] = [];
  if (!input.crmSignals?.length) unknowns.push("CRM conversion and lifecycle data unavailable");
  if (!input.decisionMakerRole) unknowns.push("Decision-maker role unverified");
  if (!input.roiMetrics || Object.keys(input.roiMetrics).length === 0) unknowns.push("Internal ROI baseline unavailable");

  return {
    pains,
    evidence,
    unknowns,
    commercialOpportunity: bounded(
      (pains.length * 18) + (evidence.length * 8) + (input.employeeCount && input.employeeCount >= 25 ? 20 : 0),
      25,
    ),
    evidenceBaseline: bounded(evidence.length * 18, 15),
    uncertainty: bounded(unknowns.length * 20, 40),
  };
}

export function draftOutreach(input: ProspectInput, intelligence: ProspectIntelligence): OutreachDraft {
  const route = matchSalesRoute(intelligence);
  const primaryPain = intelligence.pains[0] ?? "operational bottlenecks";
  const recipient = input.decisionMakerName?.trim() || "there";
  const angle = {
    SOVEREIGN_LOCAL_AI: "a sovereign local AI engine that keeps sensitive workflow context under your control",
    BYOK_COST_REDUCTION: "a BYOK architecture that can make AI usage and SaaS costs more transparent",
    HITL_COMPLIANCE: "a human-in-the-loop compliance gate for controlled AI-assisted workflows",
  }[route];
  const roi = Object.entries(input.roiMetrics ?? {})
    .slice(0, 2)
    .map(([name, value]) => `${name}: ${value}`)
    .join(", ");
  const subject = renderTemplate("{{COMPANY}}: reducing {{PAIN}} safely", {
    COMPANY: input.companyName,
    PAIN: primaryPain,
  });
  const body = renderTemplate(
    `Hi {{NAME}},\n\nI noticed {{COMPANY}} may be dealing with {{PAIN}}. AIVaultsAI can validate {{ANGLE}} in a focused 14-day pilot (€3,500), without locking you into a platform.{{ROI}}\n\nWould a short discovery call next week be useful?`,
    {
      NAME: recipient,
      COMPANY: input.companyName,
      PAIN: primaryPain,
      ANGLE: angle,
      ROI: roi ? ` Your supplied baseline: ${roi}.` : "",
    },
  );
  return {
    subject,
    body,
    optOutLine: "If this is not relevant, reply ‘opt out’ and we will not contact you again.",
  };
}

/**
 * Staged workflow: intelligence is resolved before formatting, scoring is
 * deterministic, and no dispatch happens here. A run must have been claimed
 * atomically by persistence before the workflow can begin.
 */
export async function runProspectAgent(
  runId: string,
  input: ProspectInput,
  dispatchMode: DispatchMode,
  deps: ProspectAgentDeps,
): Promise<ProspectRunResult> {
  if (!await deps.claimRun(runId)) {
    return { runId, state: "BLOCKED", blockedReason: "RUN_ALREADY_CLAIMED" };
  }
  const intelligence = await deps.analyze({
    ...input,
    decisionMakerName: undefined,
    verifiedBusinessEmail: undefined,
    publicSignals: (input.publicSignals ?? []).map(sanitizeIntelligenceContext),
    crmSignals: (input.crmSignals ?? []).map(sanitizeIntelligenceContext),
  });
  const score = scoreProspect(intelligence);
  const route = matchSalesRoute(intelligence);
  const now = deps.now?.() ?? new Date().toISOString();
  const draft = draftOutreach(input, intelligence);
  const state = isVerifiedBusinessEmail(input.verifiedBusinessEmail)
    ? dispatchMode === "HUMAN_REVIEW" ? "AWAITING_REVIEW" : "QUEUED"
    : "BLOCKED";
  const manifest: RunManifest = {
    runId,
    createdAt: now,
    state,
    inputs: {
      companyName: input.companyName,
      websiteUrl: input.websiteUrl,
      industry: input.industry ?? null,
      employeeCount: input.employeeCount ?? null,
      hasVerifiedBusinessEmail: isVerifiedBusinessEmail(input.verifiedBusinessEmail),
    },
    evidence: intelligence.evidence,
    score,
    route,
    dispatchMode,
    policyDecisions: [
      "PII_SANITIZED_BEFORE_AI_ANALYSIS",
      isVerifiedBusinessEmail(input.verifiedBusinessEmail) ? "VERIFIED_EMAIL_PRESENT" : "VERIFIED_EMAIL_REQUIRED",
      dispatchMode === "HUMAN_REVIEW" ? "HITL_REVIEW_REQUIRED" : "AUTO_SEND_REQUIRES_PROVIDER_GUARDS",
    ],
  };
  await deps.persistManifest(manifest);
  return {
    runId,
    state,
    score,
    route,
    draft,
    ...(state === "BLOCKED" ? { blockedReason: "VERIFIED_BUSINESS_EMAIL_REQUIRED" } : {}),
  };
}

export function newProspectRunId(): string {
  return randomUUID();
}
