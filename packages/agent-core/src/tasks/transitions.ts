import type { TaskStatus } from "./types.ts";

/**
 * Explicit allowed status transitions. DONE is terminal. FAILED may be
 * retried (FAILED -> READY) only through the explicit lifecycle method.
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  BACKLOG: ["READY"],
  READY: ["IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["REVIEW", "BLOCKED", "FAILED"],
  BLOCKED: ["READY"],
  REVIEW: ["IN_PROGRESS", "DONE", "FAILED"],
  DONE: [],
  FAILED: ["READY"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: TaskStatus): readonly TaskStatus[] {
  return TASK_TRANSITIONS[from];
}
