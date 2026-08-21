export const ORCHESTRATOR_ERROR_CODES = [
  "ORCHESTRATION_NOT_FOUND",
  "INVALID_REQUEST",
  "AGENT_NOT_FOUND",
  "TASK_CREATION_FAILED",
  "POLICY_DENIED",
  "APPROVAL_REQUIRED",
  "APPROVAL_INVALID",
  "EXECUTION_NOT_IMPLEMENTED",
  "EXECUTION_ADAPTERS_NOT_CONFIGURED",
  "INVALID_STATE_TRANSITION",
] as const;

export type OrchestratorErrorCode = (typeof ORCHESTRATOR_ERROR_CODES)[number];

export class OrchestratorError extends Error {
  readonly code: OrchestratorErrorCode;

  constructor(code: OrchestratorErrorCode, message: string) {
    super(message);
    this.name = "OrchestratorError";
    this.code = code;
  }
}

export function isOrchestratorError(value: unknown): value is OrchestratorError {
  return value instanceof OrchestratorError;
}
