import type { AgentId } from "../agents/ids.ts";
import type { Permission } from "./types.ts";
import type { RiskLevel } from "./risk.ts";

export const POLICY_DECISIONS = ["ALLOW", "DENY", "APPROVAL_REQUIRED"] as const;

export type PolicyDecision = (typeof POLICY_DECISIONS)[number];

export type PolicyRequest = {
  readonly requestId: string;
  readonly agentId: string;
  readonly toolId: string;
  readonly requestedPermissions: readonly string[];
  readonly riskLevel: string;
  readonly approvalId?: string;
  readonly taskId?: string;
};

export type PolicyResult = {
  readonly decision: PolicyDecision;
  readonly agentId: string;
  readonly toolId: string;
  readonly riskLevel: RiskLevel | "UNKNOWN";
  readonly requiredPermissions: readonly Permission[];
  readonly missingPermissions: readonly string[];
  readonly reason: string;
  readonly approvalRequired: boolean;
};

export function isValidPolicyDecision(value: unknown): value is PolicyDecision {
  return (
    typeof value === "string" && (POLICY_DECISIONS as readonly string[]).includes(value)
  );
}

export type PolicyContext = {
  readonly request: PolicyRequest;
  readonly agentId: AgentId | null;
  readonly toolId: string;
  readonly riskLevel: RiskLevel | "UNKNOWN";
  readonly requiredPermissions: readonly Permission[];
  readonly missingPermissions: readonly string[];
};

export function deny(
  context: PolicyContext,
  reason: string,
  missingPermissions: readonly string[] = context.missingPermissions,
): PolicyResult {
  return {
    decision: "DENY",
    agentId: context.request.agentId,
    toolId: context.request.toolId,
    riskLevel: context.riskLevel,
    requiredPermissions: context.requiredPermissions,
    missingPermissions,
    reason,
    approvalRequired: false,
  };
}

export function approvalRequired(context: PolicyContext, reason: string): PolicyResult {
  return {
    decision: "APPROVAL_REQUIRED",
    agentId: context.request.agentId,
    toolId: context.request.toolId,
    riskLevel: context.riskLevel,
    requiredPermissions: context.requiredPermissions,
    missingPermissions: context.missingPermissions,
    reason,
    approvalRequired: true,
  };
}

export function allow(context: PolicyContext, reason: string): PolicyResult {
  return {
    decision: "ALLOW",
    agentId: context.request.agentId,
    toolId: context.request.toolId,
    riskLevel: context.riskLevel,
    requiredPermissions: context.requiredPermissions,
    missingPermissions: [],
    reason,
    approvalRequired: false,
  };
}
