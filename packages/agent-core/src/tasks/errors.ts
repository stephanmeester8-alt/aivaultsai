export const TASK_ENGINE_ERROR_CODES = [
  "TASK_NOT_FOUND",
  "INVALID_TASK",
  "INVALID_AGENT",
  "INVALID_STATUS",
  "INVALID_TRANSITION",
  "TASK_NOT_ASSIGNABLE",
  "TASK_ALREADY_EXISTS",
] as const;

export type TaskEngineErrorCode = (typeof TASK_ENGINE_ERROR_CODES)[number];

export class TaskEngineError extends Error {
  readonly code: TaskEngineErrorCode;

  constructor(code: TaskEngineErrorCode, message: string) {
    super(message);
    this.name = "TaskEngineError";
    this.code = code;
  }
}

export function isTaskEngineError(value: unknown): value is TaskEngineError {
  return value instanceof TaskEngineError;
}
