import type { AgentId } from "../agents/ids.ts";
import type { RiskLevel } from "../permissions/risk.ts";

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

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
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function isValidTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (TASK_PRIORITIES as readonly string[]).includes(value);
}

export function isValidTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
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
