export const HANDOFF_ENGINE_ERROR_CODES = [
  "HANDOFF_NOT_FOUND",
  "INVALID_HANDOFF",
  "INVALID_AGENT",
  "SELF_HANDOFF",
  "INVALID_HANDOFF_TARGET",
  "TASK_NOT_FOUND",
  "HANDOFF_ALREADY_EXISTS",
] as const;

export type HandoffEngineErrorCode = (typeof HANDOFF_ENGINE_ERROR_CODES)[number];

export class HandoffEngineError extends Error {
  readonly code: HandoffEngineErrorCode;

  constructor(code: HandoffEngineErrorCode, message: string) {
    super(message);
    this.name = "HandoffEngineError";
    this.code = code;
  }
}

export function isHandoffEngineError(value: unknown): value is HandoffEngineError {
  return value instanceof HandoffEngineError;
}
