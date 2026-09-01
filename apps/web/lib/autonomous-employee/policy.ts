/**
 * Autonomous Employee — policy & decision engine (TASK FASE 4/6).
 *
 * Deterministic, fail-closed. Reuses the existing prospect scoring; the
 * employee never invents decisions:
 * - UNKNOWN AI status blocks automated outreach
 * - every side effect passes a permission check
 * - email send requires human approval AND the existing dispatcher gates
 */

import { scoreProspect } from "../prospect-run/scoring.ts";
import type { ProspectIntelligence } from "../prospect-run/types.ts";
import type {
  AiDetectionResult,
  AiDetectionStatus,
} from "../prospect-run/ai-detection.ts";
import type { EmployeeDecision } from "./types.ts";

export type EmployeePermission =
  | "discovery.read"
  | "website.research"
  | "ai.detect"
  | "database.read"
  | "database.write"
  | "outreach.draft"
  | "email.send";

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

/** Static permission matrix for the employee's deterministic workflow. */
export const PERMISSION_POLICY: Record<EmployeePermission, PolicyResult> = {
  "discovery.read": { allowed: true },
  "website.research": { allowed: true },
  "ai.detect": { allowed: true },
  "database.read": { allowed: true },
  "database.write": { allowed: true },
  "outreach.draft": { allowed: true },
  // The only externally visible side effect: never without human approval.
  "email.send": { allowed: false, reason: "EMAIL_SEND_REQUIRES_APPROVAL" },
};

export function checkPermission(permission: EmployeePermission): PolicyResult {
  return PERMISSION_POLICY[permission] ?? { allowed: false, reason: "UNKNOWN_PERMISSION" };
}

export interface DecisionInput {
  intelligence: ProspectIntelligence;
  aiDetection: AiDetectionResult | null;
  qualifiedThreshold: number;
  insufficientThreshold: number;
}

export interface DecisionOutput {
  decision: EmployeeDecision;
  score: ReturnType<typeof scoreProspect>;
  reason: string;
  evidence: string[];
}

/**
 * Decision engine (deterministic):
 * - research/analysis failure -> BLOCKED
 * - AI status UNKNOWN + would-be qualified -> INSUFFICIENT_EVIDENCE (no
 *   automated outreach on unproven evidence)
 * - score < insufficient threshold -> NOT_QUALIFIED
 * - score below qualified threshold -> INSUFFICIENT_EVIDENCE
 * - score >= qualified threshold -> QUALIFIED
 */
export function decideProspect(input: DecisionInput): DecisionOutput {
  const score = scoreProspect(input.intelligence);
  const evidence = [...input.intelligence.evidence, ...input.intelligence.unknowns];
  const aiStatus: AiDetectionStatus | null = input.aiDetection?.status ?? null;

  if (input.aiDetection === null) {
    return {
      decision: "BLOCKED",
      score,
      reason: "Website research failed; no detection evidence available",
      evidence,
    };
  }

  if (score.total >= input.qualifiedThreshold && aiStatus === "unknown") {
    return {
      decision: "INSUFFICIENT_EVIDENCE",
      score,
      reason: `Score ${score.total} but AI presence is UNKNOWN (confidence ${input.aiDetection.confidence}); automated outreach blocked on unproven evidence`,
      evidence,
    };
  }

  if (score.total >= input.qualifiedThreshold) {
    return {
      decision: "QUALIFIED",
      score,
      reason: `Score ${score.total} with AI status ${aiStatus} (confidence ${input.aiDetection.confidence})`,
      evidence,
    };
  }

  if (score.total >= input.insufficientThreshold) {
    return {
      decision: "INSUFFICIENT_EVIDENCE",
      score,
      reason: `Score ${score.total} is below the qualified threshold (${input.qualifiedThreshold})`,
      evidence,
    };
  }

  return {
    decision: "NOT_QUALIFIED",
    score,
    reason: `Score ${score.total} is below the minimum interest threshold (${input.insufficientThreshold})`,
    evidence,
  };
}

export const DEFAULT_QUALIFIED_THRESHOLD = 50;
export const DEFAULT_INSUFFICIENT_THRESHOLD = 30;
