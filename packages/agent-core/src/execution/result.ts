import type { ExecutionRequest, ExecutionResult } from "./types.ts";

function now(): string {
  return new Date().toISOString();
}

/** Build a result for a request that never reached an adapter. */
export function rejectedResult(request: ExecutionRequest, error: string): ExecutionResult {
  const timestamp = now();
  return {
    executionId: request.executionId,
    status: "REJECTED",
    toolId: request.toolId,
    taskId: request.taskId,
    agentId: String(request.agentId),
    output: null,
    error,
    executionOccurred: false,
    startedAt: timestamp,
    completedAt: timestamp,
  };
}

/** Build a result for an authorized request whose tool has no adapter. */
export function notImplementedResult(request: ExecutionRequest, error: string): ExecutionResult {
  const timestamp = now();
  return {
    executionId: request.executionId,
    status: "NOT_IMPLEMENTED",
    toolId: request.toolId,
    taskId: request.taskId,
    agentId: String(request.agentId),
    output: null,
    error,
    executionOccurred: false,
    startedAt: timestamp,
    completedAt: timestamp,
  };
}

/** Build a successful execution result (adapter ran). */
export function succeededResult(
  request: ExecutionRequest,
  output: unknown,
  startedAt: string,
): ExecutionResult {
  return {
    executionId: request.executionId,
    status: "SUCCEEDED",
    toolId: request.toolId,
    taskId: request.taskId,
    agentId: String(request.agentId),
    output,
    error: null,
    executionOccurred: true,
    startedAt,
    completedAt: now(),
  };
}

/** Build a failed execution result (adapter ran and failed). */
export function failedResult(
  request: ExecutionRequest,
  error: string,
  startedAt: string,
): ExecutionResult {
  return {
    executionId: request.executionId,
    status: "FAILED",
    toolId: request.toolId,
    taskId: request.taskId,
    agentId: String(request.agentId),
    output: null,
    error,
    executionOccurred: true,
    startedAt,
    completedAt: now(),
  };
}

/** Result factory used by tool adapters when an adapter crashes unexpectedly. */
export function adapterCrashResult(
  request: ExecutionRequest,
  error: unknown,
  startedAt: string,
): ExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  return failedResult(request, `Adapter crashed: ${message}`, startedAt);
}
