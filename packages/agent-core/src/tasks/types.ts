import type { AgentId } from "../agents/ids.ts";
import type { RiskLevel } from "../permissions/risk.ts";

/**
 * Canonical priority contract: integer 1..5, LOWER number = HIGHER priority
 * (see agents/contracts/task.md). Priority is independent of RiskLevel.
 */
export const TASK_PRIORITY_MIN = 1;
export const TASK_PRIORITY_MAX = 5;

export const TASK_PRIORITIES = [1, 2, 3, 4, 5] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  "BACKLOG",
  "READY",
  "IN_PROGRESS",
  "BLOCKED",
  "REVIEW",
  "DONE",
  "FAILED",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskCreatedBy = AgentId | "human" | "system";

export type Task = {
  readonly taskId: string;
  readonly title: string;
  readonly objective: string;
  readonly createdBy: TaskCreatedBy;
  readonly assignedTo: AgentId | null;
  readonly priority: TaskPriority;
  readonly status: TaskStatus;
  readonly riskLevel: RiskLevel;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly expectedOutput: string;
  readonly dependencies: readonly string[];
  readonly evidenceRequired: boolean;
  /** Set when the task transitions to FAILED; cleared on retry. Optional on
   * input; the engine normalizes stored records to always carry the field. */
  readonly failureReason?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function isValidTaskPriority(value: unknown): value is TaskPriority {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= TASK_PRIORITY_MIN &&
    value <= TASK_PRIORITY_MAX
  );
}

export function isValidTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

/**
 * Default priority mapping used when a request does not supply one.
 * Higher risk maps to a more urgent (lower) priority number.
 * Callers may override with an explicit priority.
 */
export function riskToPriority(risk: RiskLevel): TaskPriority {
  switch (risk) {
    case "LOW":
      return 4;
    case "MEDIUM":
      return 3;
    case "HIGH":
      return 2;
    case "CRITICAL":
      return 1;
  }
}

export function createTask(input: Task): Task {
  if (!input.taskId) {
    throw new Error("taskId is required");
  }
  if (!isValidTaskPriority(input.priority)) {
    throw new Error(`Invalid task priority: ${String(input.priority)}`);
  }
  if (!isValidTaskStatus(input.status)) {
    throw new Error(`Invalid task status: ${String(input.status)}`);
  }
  return input;
}
