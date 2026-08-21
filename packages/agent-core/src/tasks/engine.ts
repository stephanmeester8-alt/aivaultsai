import type { AgentRegistry } from "../agents/registry.ts";
import { isValidAgentId } from "../agents/ids.ts";
import { isValidRiskLevel } from "../permissions/risk.ts";
import { TaskEngineError } from "./errors.ts";
import type { TaskEvent } from "./events.ts";
import { canTransition } from "./transitions.ts";
import {
  isValidTaskPriority,
  isValidTaskStatus,
  type Task,
  type TaskCreatedBy,
  type TaskStatus,
} from "./types.ts";

const ASSIGNABLE_STATUSES: readonly TaskStatus[] = ["BACKLOG", "READY", "BLOCKED"];
const INITIAL_STATUSES: readonly TaskStatus[] = ["BACKLOG", "READY"];
const WORK_STATUSES: readonly TaskStatus[] = ["IN_PROGRESS", "REVIEW"];

export type TaskPatch = {
  readonly title?: string;
  readonly objective?: string;
  readonly priority?: Task["priority"];
  readonly riskLevel?: Task["riskLevel"];
  readonly inputs?: Task["inputs"];
  readonly expectedOutput?: string;
  readonly dependencies?: Task["dependencies"];
  readonly evidenceRequired?: boolean;
};

function now(): string {
  return new Date().toISOString();
}

function cloneTask(task: Task): Task {
  return {
    ...task,
    failureReason: task.failureReason ?? null,
    inputs: { ...task.inputs },
    dependencies: [...task.dependencies],
  };
}

function isValidCreatedBy(value: unknown): value is TaskCreatedBy {
  return value === "human" || value === "system" || isValidAgentId(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export class TaskEngine {
  readonly #tasks = new Map<string, Task>();
  readonly #events: TaskEvent[] = [];
  readonly #agents: AgentRegistry;
  #eventCount = 0;

  constructor(agentRegistry: AgentRegistry) {
    this.#agents = agentRegistry;
  }

  createTask(task: Task): Task {
    this.#assertValidTask(task);
    if (this.#tasks.has(task.taskId)) {
      throw new TaskEngineError(
        "TASK_ALREADY_EXISTS",
        `Task already exists: ${task.taskId}`,
      );
    }
    if (!INITIAL_STATUSES.includes(task.status)) {
      throw new TaskEngineError(
        "INVALID_STATUS",
        `Tasks must be created in BACKLOG or READY, received ${task.status}`,
      );
    }
    const stored = cloneTask(task);
    this.#tasks.set(stored.taskId, stored);
    this.#recordEvent({
      taskId: stored.taskId,
      type: "TASK_CREATED",
      fromStatus: null,
      toStatus: stored.status,
      actor: stored.createdBy,
    });
    return cloneTask(stored);
  }

  getTask(taskId: string): Task {
    return cloneTask(this.#requireTask(taskId));
  }

  listTasks(): readonly Task[] {
    return [...this.#tasks.values()].map(cloneTask);
  }

  hasTask(taskId: string): boolean {
    return this.#tasks.has(taskId);
  }

  assignTask(taskId: string, agentId: string): Task {
    const current = this.#requireTask(taskId);
    if (!isValidAgentId(agentId) || !this.#agents.has(agentId)) {
      throw new TaskEngineError("INVALID_AGENT", `Unknown agent: ${agentId}`);
    }
    if (!ASSIGNABLE_STATUSES.includes(current.status)) {
      throw new TaskEngineError(
        "TASK_NOT_ASSIGNABLE",
        `Task ${taskId} in ${current.status} cannot be reassigned`,
      );
    }
    const updated = this.#replace(taskId, {
      ...current,
      assignedTo: agentId,
      updatedAt: now(),
    });
    this.#recordEvent({
      taskId,
      type: "TASK_ASSIGNED",
      fromStatus: current.status,
      toStatus: current.status,
      actor: agentId,
    });
    return cloneTask(updated);
  }

  transitionTask(taskId: string, newStatus: string): Task {
    const current = this.#requireTask(taskId);
    if (!isValidTaskStatus(newStatus)) {
      throw new TaskEngineError("INVALID_STATUS", `Invalid status: ${newStatus}`);
    }
    if (!canTransition(current.status, newStatus)) {
      throw new TaskEngineError(
        "INVALID_TRANSITION",
        `Cannot transition ${current.status} → ${newStatus}`,
      );
    }
    if (WORK_STATUSES.includes(newStatus) && current.assignedTo === null) {
      throw new TaskEngineError(
        "TASK_NOT_ASSIGNABLE",
        `Task ${taskId} must be assigned before ${newStatus}`,
      );
    }
    const updated = this.#replace(taskId, {
      ...current,
      status: newStatus,
      updatedAt: now(),
    });
    this.#recordEvent({
      taskId,
      type: "TASK_STATUS_CHANGED",
      fromStatus: current.status,
      toStatus: newStatus,
      actor: current.assignedTo ?? current.createdBy,
    });
    return cloneTask(updated);
  }

  /**
   * Validate a stored task against its invariants without mutating state.
   * Returns a list of problems; an empty list means the task is valid.
   */
  validateTask(taskId: string): string[] {
    const task = this.#requireTask(taskId);
    const problems: string[] = [];
    if (!isNonEmptyString(task.title)) problems.push("title must be a non-empty string");
    if (!isNonEmptyString(task.objective)) problems.push("objective must be a non-empty string");
    if (!isValidTaskPriority(task.priority)) problems.push(`invalid priority: ${String(task.priority)}`);
    if (!isValidRiskLevel(task.riskLevel)) problems.push(`invalid riskLevel: ${String(task.riskLevel)}`);
    if (WORK_STATUSES.includes(task.status) && task.assignedTo === null) {
      problems.push(`${task.status} requires an assigned agent`);
    }
    if (task.status === "DONE" && task.evidenceRequired) {
      problems.push("DONE requires linked Evidence when evidenceRequired is true");
    }
    return problems;
  }

  /** BACKLOG -> READY: make a recorded task ready to start. */
  scheduleTask(taskId: string): Task {
    return this.transitionTask(taskId, "READY");
  }

  /** READY -> IN_PROGRESS: begin work (requires an assigned agent). */
  executeTask(taskId: string): Task {
    return this.transitionTask(taskId, "IN_PROGRESS");
  }

  /**
   * REVIEW -> DONE. When the task declares evidenceRequired, the caller must
   * prove linked evidence (evidenceLinked: true) or the transition is refused.
   */
  completeTask(
    taskId: string,
    options: { evidenceLinked?: boolean } = {},
  ): Task {
    const current = this.#requireTask(taskId);
    if (current.evidenceRequired && options.evidenceLinked !== true) {
      throw new TaskEngineError(
        "EVIDENCE_REQUIRED",
        `Task ${taskId} requires linked Evidence before DONE`,
      );
    }
    return this.transitionTask(taskId, "DONE");
  }

  /** IN_PROGRESS | REVIEW -> FAILED, recording why. */
  failTask(taskId: string, reason: string): Task {
    const current = this.#requireTask(taskId);
    if (current.status !== "IN_PROGRESS" && current.status !== "REVIEW") {
      throw new TaskEngineError(
        "INVALID_TRANSITION",
        `Task ${taskId} in ${current.status} cannot be failed`,
      );
    }
    if (!isNonEmptyString(reason)) {
      throw new TaskEngineError("INVALID_TASK", "failure reason must be a non-empty string");
    }
    const updated = this.#replace(taskId, {
      ...current,
      status: "FAILED",
      failureReason: reason,
      updatedAt: now(),
    });
    this.#recordEvent({
      taskId,
      type: "TASK_STATUS_CHANGED",
      fromStatus: current.status,
      toStatus: "FAILED",
      actor: current.assignedTo ?? current.createdBy,
    });
    return cloneTask(updated);
  }

  /** FAILED | BLOCKED -> READY, clearing the recorded failure reason. */
  retryTask(taskId: string): Task {
    const current = this.#requireTask(taskId);
    if (current.status !== "FAILED" && current.status !== "BLOCKED") {
      throw new TaskEngineError(
        "INVALID_TRANSITION",
        `Task ${taskId} in ${current.status} cannot be retried`,
      );
    }
    const updated = this.#replace(taskId, {
      ...current,
      status: "READY",
      failureReason: null,
      updatedAt: now(),
    });
    this.#recordEvent({
      taskId,
      type: "TASK_STATUS_CHANGED",
      fromStatus: current.status,
      toStatus: "READY",
      actor: current.assignedTo ?? current.createdBy,
    });
    return cloneTask(updated);
  }

  updateTask(taskId: string, patch: TaskPatch): Task {
    const current = this.#requireTask(taskId);
    if ("status" in patch || "assignedTo" in patch || "taskId" in patch || "createdBy" in patch) {
      throw new TaskEngineError(
        "INVALID_TASK",
        "status, assignedTo, taskId, and createdBy cannot be updated via updateTask",
      );
    }
    const next: Task = {
      ...current,
      title: patch.title ?? current.title,
      objective: patch.objective ?? current.objective,
      priority: patch.priority ?? current.priority,
      riskLevel: patch.riskLevel ?? current.riskLevel,
      inputs: patch.inputs ?? current.inputs,
      expectedOutput: patch.expectedOutput ?? current.expectedOutput,
      dependencies: patch.dependencies ?? current.dependencies,
      evidenceRequired: patch.evidenceRequired ?? current.evidenceRequired,
      updatedAt: now(),
    };
    this.#assertValidTask({ ...next, status: current.status, assignedTo: current.assignedTo });
    const stored = this.#replace(taskId, next);
    return cloneTask(stored);
  }

  listEvents(): readonly TaskEvent[] {
    return this.#events.map((event) => ({ ...event }));
  }

  #requireTask(taskId: string): Task {
    const task = this.#tasks.get(taskId);
    if (!task) {
      throw new TaskEngineError("TASK_NOT_FOUND", `Unknown task: ${taskId}`);
    }
    return task;
  }

  #replace(taskId: string, task: Task): Task {
    const stored = cloneTask(task);
    this.#tasks.set(taskId, stored);
    return stored;
  }

  #recordEvent(event: Omit<TaskEvent, "eventId" | "timestamp">): void {
    this.#eventCount += 1;
    this.#events.push({
      eventId: `evt_${this.#eventCount}`,
      timestamp: now(),
      ...event,
    });
  }

  #assertValidTask(task: Task): void {
    if (!isNonEmptyString(task.taskId)) {
      throw new TaskEngineError("INVALID_TASK", "taskId must be a non-empty string");
    }
    if (!isNonEmptyString(task.title)) {
      throw new TaskEngineError("INVALID_TASK", "title must be a non-empty string");
    }
    if (!isNonEmptyString(task.objective)) {
      throw new TaskEngineError("INVALID_TASK", "objective must be a non-empty string");
    }
    if (!isValidCreatedBy(task.createdBy)) {
      throw new TaskEngineError("INVALID_TASK", `Invalid createdBy: ${String(task.createdBy)}`);
    }
    if (task.assignedTo !== null) {
      if (!isValidAgentId(task.assignedTo) || !this.#agents.has(task.assignedTo)) {
        throw new TaskEngineError("INVALID_AGENT", `Unknown agent: ${String(task.assignedTo)}`);
      }
    }
    if (!isValidTaskPriority(task.priority)) {
      throw new TaskEngineError("INVALID_TASK", `Invalid priority: ${String(task.priority)}`);
    }
    if (!isValidTaskStatus(task.status)) {
      throw new TaskEngineError("INVALID_STATUS", `Invalid status: ${String(task.status)}`);
    }
    if (!isValidRiskLevel(task.riskLevel)) {
      throw new TaskEngineError("INVALID_TASK", `Invalid riskLevel: ${String(task.riskLevel)}`);
    }
    if (typeof task.expectedOutput !== "string") {
      throw new TaskEngineError("INVALID_TASK", "expectedOutput must be a string");
    }
    if (!Array.isArray(task.dependencies)) {
      throw new TaskEngineError("INVALID_TASK", "dependencies must be an array");
    }
    if (typeof task.evidenceRequired !== "boolean") {
      throw new TaskEngineError("INVALID_TASK", "evidenceRequired must be a boolean");
    }
    if (task.failureReason !== undefined && task.failureReason !== null) {
      if (typeof task.failureReason !== "string" || task.failureReason.trim().length === 0) {
        throw new TaskEngineError("INVALID_TASK", "failureReason must be a non-empty string or null");
      }
    }
    if (!isNonEmptyString(task.createdAt) || !isNonEmptyString(task.updatedAt)) {
      throw new TaskEngineError("INVALID_TASK", "createdAt and updatedAt must be non-empty strings");
    }
  }
}

export function createTaskEngine(agentRegistry: AgentRegistry): TaskEngine {
  return new TaskEngine(agentRegistry);
}
