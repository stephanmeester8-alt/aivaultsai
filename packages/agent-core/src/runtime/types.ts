import type { AgentId } from "../agents/ids.ts";
import type { Permission } from "../permissions/types.ts";
import type { RiskLevel } from "../permissions/risk.ts";
import type { TaskPriority } from "../tasks/types.ts";
import type { OrchestrationResult } from "../orchestration/types.ts";

/**
 * Agent runtime lifecycle (TASK 22). Each state is explicit; transitions are
 * driven by the underlying engines and the Execution Gate, never invented.
 */
export const AGENT_RUN_STATES = [
  "RECEIVED",
  "PLANNED",
  "POLICY_CHECKED",
  "APPROVAL_REQUIRED",
  "APPROVED",
  "READY_FOR_EXECUTION",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "HANDED_OFF",
] as const;

export type AgentRunState = (typeof AGENT_RUN_STATES)[number];

export type AgentRunRequest = {
  /** Optional stable run id; generated when omitted. */
  readonly runId?: string;
  readonly agentId: AgentId;
  readonly objective: string;
  readonly toolId: string;
  readonly requestedPermissions: readonly Permission[];
  readonly riskLevel: RiskLevel;
  readonly expectedOutput: string;
  /** Tool invocation input: `{ capability, arguments }`. */
  readonly input?: Readonly<Record<string, unknown>>;
  readonly priority?: TaskPriority;
  readonly createdBy?: AgentId | "human" | "system";
};

export type AgentRun = {
  readonly runId: string;
  readonly state: AgentRunState;
  readonly taskId: string | null;
  readonly agentId: string | null;
  readonly toolId: string | null;
  readonly orchestration: OrchestrationResult;
  /** Summary of the last Execution Gate result (null before execution). */
  readonly execution: OrchestrationResult["executionResult"];
  readonly evidenceIds: readonly string[];
  readonly handoffId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly failureReason: string | null;
};
