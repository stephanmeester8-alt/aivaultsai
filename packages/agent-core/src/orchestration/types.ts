import type { AgentId } from "../agents/ids.ts";
import type { Permission } from "../permissions/types.ts";
import type { RiskLevel } from "../permissions/risk.ts";
import type { TaskCreatedBy, TaskPriority } from "../tasks/types.ts";
import type { PolicyResult } from "../permissions/policy-types.ts";
import type { OrchestrationState } from "./states.ts";

export type OrchestrationRequest = {
  readonly requestId: string;
  readonly objective: string;
  readonly createdBy: TaskCreatedBy;
  readonly assignedAgent: AgentId;
  readonly toolId: string;
  readonly requestedPermissions: readonly Permission[];
  readonly riskLevel: RiskLevel;
  readonly expectedOutput: string;
  /** Tool invocation input: `{ capability, arguments }`. Optional; default {}. */
  readonly input?: Readonly<Record<string, unknown>>;
  /** Optional explicit task priority (1..5). Defaults to riskToPriority(riskLevel). */
  readonly priority?: TaskPriority;
};

export type OrchestrationResult = {
  readonly requestId: string;
  readonly taskId: string | null;
  readonly agentId: string | null;
  readonly state: OrchestrationState;
  readonly policyResult: PolicyResult | null;
  readonly approvalId: string | null;
  readonly handoffId: string | null;
  readonly evidenceIds: readonly string[];
  /** Populated after execute(): the last execution result produced by the gate. */
  readonly executionResult: {
    readonly executionId: string;
    readonly status: "SUCCEEDED" | "FAILED" | "REJECTED" | "NOT_IMPLEMENTED";
    readonly executionOccurred: boolean;
    readonly error: string | null;
    /** SHA-256 of the invocation input (no raw input is persisted). */
    readonly inputHash: string | null;
    /** SHA-256 of the execution output (no raw output is persisted). */
    readonly outputHash: string | null;
  } | null;
  readonly reason: string;
};
