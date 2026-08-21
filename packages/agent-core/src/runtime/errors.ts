export const RUNTIME_ERROR_CODES = [
  "RUN_ALREADY_EXISTS",
  "RUN_NOT_FOUND",
  "INVALID_RUN_REQUEST",
  "AGENT_NOT_FOUND",
  "INVALID_STATE_TRANSITION",
] as const;

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;

  constructor(code: RuntimeErrorCode, message: string) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
  }
}

export function isRuntimeError(value: unknown): value is RuntimeError {
  return value instanceof RuntimeError;
}
