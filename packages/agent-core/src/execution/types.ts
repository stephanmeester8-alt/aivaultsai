import type { AgentId } from "../agents/ids.ts";
import type { Permission } from "../permissions/types.ts";
import type { RiskLevel } from "../permissions/risk.ts";
import type { PolicyResult } from "../permissions/policy-types.ts";

export const EXECUTION_STATUSES = [
  "NOT_IMPLEMENTED",
  "REJECTED",
  "SUCCEEDED",
  "FAILED",
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export type ExecutionRequest = {
  readonly executionId: string;
  readonly taskId: string;
  readonly agentId: AgentId | string;
  readonly toolId: string;
  readonly requestedAction: string;
  readonly requestedPermissions: readonly Permission[] | readonly string[];
  readonly riskLevel: string;
  readonly approvalId: string | null;
  readonly input: Readonly<Record<string, unknown>>;
  readonly authorization?: PolicyResult | null;
};

export type ExecutionResult = {
  readonly executionId: string;
  readonly status: ExecutionStatus;
  readonly toolId: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly output: unknown;
  readonly error: string | null;
  readonly executionOccurred: false;
  readonly startedAt: string;
  readonly completedAt: string;
};
