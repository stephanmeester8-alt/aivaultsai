import { isValidAgentId, type AgentId } from "../agents/ids.ts";

export type Handoff = {
  readonly handoffId: string;
  readonly fromAgent: AgentId;
  readonly toAgent: AgentId;
  readonly taskId: string;
  readonly objective: string;
  readonly completedWork: string;
  readonly findings: readonly string[];
  readonly decisions: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly risks: readonly string[];
  readonly openQuestions: readonly string[];
  readonly recommendedNextAction: string;
  readonly createdAt: string;
};

export function createHandoff(input: Handoff): Handoff {
  if (!isValidAgentId(input.fromAgent)) {
    throw new Error(`Invalid fromAgent: ${String(input.fromAgent)}`);
  }
  if (!isValidAgentId(input.toAgent)) {
    throw new Error(`Invalid toAgent: ${String(input.toAgent)}`);
  }
  if (input.fromAgent === input.toAgent) {
    throw new Error("fromAgent and toAgent must differ");
  }
  return input;
}
