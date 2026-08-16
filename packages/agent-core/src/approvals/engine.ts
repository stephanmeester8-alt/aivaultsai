import type { AgentRegistry } from "../agents/registry.ts";
import { isValidAgentId } from "../agents/ids.ts";
import { isValidRiskLevel } from "../permissions/risk.ts";
import type { TaskEngine } from "../tasks/engine.ts";
import { ApprovalEngineError } from "./errors.ts";
import type { ApprovalEvent } from "./events.ts";
import { canTransitionApproval } from "./transitions.ts";
import {
  isValidApprovalStatus,
  type Approval,
  type ApprovalStatus,
} from "./types.ts";

function now(): string {
  return new Date().toISOString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cloneApproval(approval: Approval): Approval {
  return { ...approval };
}

export class ApprovalEngine {
  readonly #approvals = new Map<string, Approval>();
  readonly #events: ApprovalEvent[] = [];
  readonly #agents: AgentRegistry;
  readonly #tasks: TaskEngine;
  #eventCount = 0;

  constructor(agentRegistry: AgentRegistry, taskEngine: TaskEngine) {
    this.#agents = agentRegistry;
    this.#tasks = taskEngine;
  }

  createApproval(approval: Approval): Approval {
    this.#assertValidCreate(approval);
    if (this.#approvals.has(approval.approvalId)) {
      throw new ApprovalEngineError(
        "APPROVAL_ALREADY_EXISTS",
        `Approval already exists: ${approval.approvalId}`,
      );
    }
    const stored = cloneApproval({
      ...approval,
      status: "PENDING",
      approvedBy: null,
      resolvedAt: null,
    });
    this.#approvals.set(stored.approvalId, stored);
    this.#recordEvent({
      approvalId: stored.approvalId,
      taskId: stored.taskId,
      type: "APPROVAL_CREATED",
      fromStatus: null,
      toStatus: "PENDING",
      approver: null,
    });
    return cloneApproval(stored);
  }

  getApproval(approvalId: string): Approval {
    return cloneApproval(this.#require(approvalId));
  }

  listApprovals(): readonly Approval[] {
    return [...this.#approvals.values()].map(cloneApproval);
  }

  hasApproval(approvalId: string): boolean {
    return this.#approvals.has(approvalId);
  }

  approve(approvalId: string, approver: string): Approval {
    return this.#resolve(approvalId, "APPROVED", "APPROVAL_APPROVED", approver);
  }

  reject(approvalId: string, approver: string): Approval {
    return this.#resolve(approvalId, "REJECTED", "APPROVAL_REJECTED", approver);
  }

  expire(approvalId: string): Approval {
    const current = this.#require(approvalId);
    this.#assertPending(current, "EXPIRED");
    const stored = this.#replace({
      ...current,
      status: "EXPIRED",
      resolvedAt: now(),
    });
    this.#recordEvent({
      approvalId,
      taskId: stored.taskId,
      type: "APPROVAL_EXPIRED",
      fromStatus: current.status,
      toStatus: "EXPIRED",
      approver: null,
    });
    return cloneApproval(stored);
  }

  listByTask(taskId: string): readonly Approval[] {
    return this.listApprovals().filter((item) => item.taskId === taskId);
  }

  listByAgent(agentId: string): readonly Approval[] {
    return this.listApprovals().filter((item) => item.requestedBy === agentId);
  }

  listEvents(): readonly ApprovalEvent[] {
    return this.#events.map((event) => ({ ...event }));
  }

  #resolve(
    approvalId: string,
    toStatus: "APPROVED" | "REJECTED",
    eventType: "APPROVAL_APPROVED" | "APPROVAL_REJECTED",
    approver: string,
  ): Approval {
    const current = this.#require(approvalId);
    this.#assertApprover(current, approver);
    this.#assertPending(current, toStatus);
    const stored = this.#replace({
      ...current,
      status: toStatus,
      approvedBy: approver.trim(),
      resolvedAt: now(),
    });
    this.#recordEvent({
      approvalId,
      taskId: stored.taskId,
      type: eventType,
      fromStatus: current.status,
      toStatus,
      approver: stored.approvedBy,
    });
    return cloneApproval(stored);
  }

  #assertPending(current: Approval, toStatus: ApprovalStatus): void {
    if (current.status !== "PENDING") {
      throw new ApprovalEngineError(
        "APPROVAL_ALREADY_RESOLVED",
        `Approval ${current.approvalId} is ${current.status} and cannot become ${toStatus}`,
      );
    }
    if (!canTransitionApproval(current.status, toStatus)) {
      throw new ApprovalEngineError(
        "INVALID_TRANSITION",
        `Cannot transition ${current.status} → ${toStatus}`,
      );
    }
  }

  #assertApprover(current: Approval, approver: string): void {
    if (!isNonEmptyString(approver)) {
      throw new ApprovalEngineError("INVALID_APPROVER", "approver must be a non-empty human identity");
    }
    if (approver.trim() === current.requestedBy) {
      throw new ApprovalEngineError(
        "SELF_APPROVAL",
        `Agent ${current.requestedBy} cannot approve its own request`,
      );
    }
    if (isValidAgentId(approver.trim())) {
      throw new ApprovalEngineError(
        "INVALID_APPROVER",
        "approvedBy must be a human identity, not an AgentId",
      );
    }
  }

  #assertValidCreate(approval: Approval): void {
    if (!isNonEmptyString(approval.approvalId)) {
      throw new ApprovalEngineError("INVALID_APPROVAL", "approvalId must be a non-empty string");
    }
    if (!isNonEmptyString(approval.taskId)) {
      throw new ApprovalEngineError("INVALID_APPROVAL", "taskId must be a non-empty string");
    }
    if (!this.#tasks.hasTask(approval.taskId)) {
      throw new ApprovalEngineError("TASK_NOT_FOUND", `Unknown task: ${approval.taskId}`);
    }
    if (!isValidAgentId(approval.requestedBy) || !this.#agents.has(approval.requestedBy)) {
      throw new ApprovalEngineError(
        "INVALID_AGENT",
        `Unknown requesting agent: ${String(approval.requestedBy)}`,
      );
    }
    if (!isValidRiskLevel(approval.riskLevel)) {
      throw new ApprovalEngineError(
        "INVALID_APPROVAL",
        `Invalid riskLevel: ${String(approval.riskLevel)}`,
      );
    }
    if (!isNonEmptyString(approval.requestedAction)) {
      throw new ApprovalEngineError("INVALID_APPROVAL", "requestedAction must be a non-empty string");
    }
    if (!isValidApprovalStatus(approval.status) || approval.status !== "PENDING") {
      throw new ApprovalEngineError(
        "INVALID_STATUS",
        "Approvals must be created as PENDING",
      );
    }
    if (approval.approvedBy !== null) {
      throw new ApprovalEngineError(
        "INVALID_APPROVAL",
        "approvedBy must be null until a human decides",
      );
    }
    if (approval.resolvedAt !== null) {
      throw new ApprovalEngineError(
        "INVALID_APPROVAL",
        "resolvedAt must be null until a human decides",
      );
    }
    if (!isNonEmptyString(approval.createdAt)) {
      throw new ApprovalEngineError("INVALID_APPROVAL", "createdAt must be a non-empty string");
    }
  }

  #require(approvalId: string): Approval {
    const approval = this.#approvals.get(approvalId);
    if (!approval) {
      throw new ApprovalEngineError("APPROVAL_NOT_FOUND", `Unknown approval: ${approvalId}`);
    }
    return approval;
  }

  #replace(approval: Approval): Approval {
    const stored = cloneApproval(approval);
    this.#approvals.set(stored.approvalId, stored);
    return stored;
  }

  #recordEvent(event: Omit<ApprovalEvent, "eventId" | "timestamp">): void {
    this.#eventCount += 1;
    this.#events.push({
      eventId: `aevt_${this.#eventCount}`,
      timestamp: now(),
      ...event,
    });
  }
}

export function createApprovalEngine(
  agentRegistry: AgentRegistry,
  taskEngine: TaskEngine,
): ApprovalEngine {
  return new ApprovalEngine(agentRegistry, taskEngine);
}
