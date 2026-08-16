import type { AgentId } from "../agents/ids.ts";
import { isValidAgentId } from "../agents/ids.ts";
import { isValidRiskLevel, type RiskLevel } from "../permissions/risk.ts";

export const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type Approval = {
  readonly approvalId: string;
  readonly taskId: string;
  readonly requestedAction: string;
  readonly riskLevel: RiskLevel;
  readonly requestedBy: AgentId;
  /** Human identity string in this phase. Not an AgentId. Not authenticated. */
  readonly approvedBy: string | null;
  readonly status: ApprovalStatus;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
};

export function isValidApprovalStatus(value: unknown): value is ApprovalStatus {
  return (
    typeof value === "string" && (APPROVAL_STATUSES as readonly string[]).includes(value)
  );
}

export function requiresHumanApproval(riskLevel: RiskLevel): boolean {
  return riskLevel === "HIGH" || riskLevel === "CRITICAL";
}

export function createApproval(input: Approval): Approval {
  if (!isValidAgentId(input.requestedBy)) {
    throw new Error(`Invalid requestedBy: ${String(input.requestedBy)}`);
  }
  if (!isValidRiskLevel(input.riskLevel)) {
    throw new Error(`Invalid riskLevel: ${String(input.riskLevel)}`);
  }
  if (!isValidApprovalStatus(input.status)) {
    throw new Error(`Invalid approval status: ${String(input.status)}`);
  }
  return input;
}
