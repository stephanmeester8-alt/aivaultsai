import type { AgentId } from "../agents/ids.ts";
import type { Permission } from "../permissions/types.ts";
import type { RiskLevel } from "../permissions/risk.ts";
import type { TaskCreatedBy } from "../tasks/types.ts";
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
  readonly reason: string;
};
