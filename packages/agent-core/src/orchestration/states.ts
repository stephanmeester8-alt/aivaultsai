export const ORCHESTRATION_STATES = [
  "CREATED",
  "ASSIGNED",
  "POLICY_CHECK",
  "WAITING_FOR_APPROVAL",
  "AUTHORIZED",
  "READY_FOR_EXECUTION",
  "EXECUTING",
  "COMPLETED",
  "HANDED_OFF",
  "BLOCKED",
  "FAILED",
] as const;

export type OrchestrationState = (typeof ORCHESTRATION_STATES)[number];

export const ORCHESTRATION_TRANSITIONS: Readonly<
  Record<OrchestrationState, readonly OrchestrationState[]>
> = {
  CREATED: ["ASSIGNED"],
  ASSIGNED: ["POLICY_CHECK"],
  POLICY_CHECK: ["WAITING_FOR_APPROVAL", "AUTHORIZED", "FAILED"],
  WAITING_FOR_APPROVAL: ["POLICY_CHECK"],
  AUTHORIZED: ["READY_FOR_EXECUTION"],
  READY_FOR_EXECUTION: ["EXECUTING"],
  EXECUTING: ["COMPLETED", "FAILED", "HANDED_OFF"],
  COMPLETED: ["HANDED_OFF"],
  HANDED_OFF: [],
  BLOCKED: [],
  FAILED: [],
};

export function canTransitionOrchestration(
  from: OrchestrationState,
  to: OrchestrationState,
): boolean {
  return ORCHESTRATION_TRANSITIONS[from].includes(to);
}
