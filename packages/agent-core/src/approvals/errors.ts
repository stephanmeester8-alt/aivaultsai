export const APPROVAL_ENGINE_ERROR_CODES = [
  "APPROVAL_NOT_FOUND",
  "INVALID_APPROVAL",
  "APPROVAL_ALREADY_EXISTS",
  "INVALID_AGENT",
  "TASK_NOT_FOUND",
  "INVALID_STATUS",
  "INVALID_TRANSITION",
  "SELF_APPROVAL",
  "APPROVAL_ALREADY_RESOLVED",
  "INVALID_APPROVER",
] as const;

export type ApprovalEngineErrorCode = (typeof APPROVAL_ENGINE_ERROR_CODES)[number];

export class ApprovalEngineError extends Error {
  readonly code: ApprovalEngineErrorCode;

  constructor(code: ApprovalEngineErrorCode, message: string) {
    super(message);
    this.name = "ApprovalEngineError";
    this.code = code;
  }
}

export function isApprovalEngineError(value: unknown): value is ApprovalEngineError {
  return value instanceof ApprovalEngineError;
}
