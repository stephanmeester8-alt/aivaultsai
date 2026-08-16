import type { AgentRegistry } from "../agents/registry.ts";
import { isValidAgentId } from "../agents/ids.ts";
import type { ApprovalEngine } from "../approvals/engine.ts";
import type { Evidence } from "../evidence/types.ts";
import type { EvidenceStore } from "../evidence/store.ts";
import type { Handoff } from "../handoffs/types.ts";
import type { HandoffEngine } from "../handoffs/engine.ts";
import { evaluatePolicy } from "../permissions/policy-engine.ts";
import { isValidRiskLevel } from "../permissions/risk.ts";
import type { TaskEngine } from "../tasks/engine.ts";
import type { Task } from "../tasks/types.ts";
import { isValidToolId } from "../tools/types.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { OrchestratorError } from "./errors.ts";
import { canTransitionOrchestration, type OrchestrationState } from "./states.ts";
import type { OrchestrationRequest, OrchestrationResult } from "./types.ts";

export type OrchestratorDependencies = {
  readonly agents: AgentRegistry;
  readonly tasks: TaskEngine;
  readonly handoffs: HandoffEngine;
  readonly evidence: EvidenceStore;
  readonly approvals: ApprovalEngine;
  readonly tools: ToolRegistry;
};

type OrchestrationRecord = {
  request: OrchestrationRequest;
  result: OrchestrationResult;
};

function now(): string {
  return new Date().toISOString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cloneResult(result: OrchestrationResult): OrchestrationResult {
  return {
    ...result,
    evidenceIds: [...result.evidenceIds],
    policyResult: result.policyResult ? { ...result.policyResult } : null,
  };
}

function emptyResult(requestId: string): OrchestrationResult {
  return {
    requestId,
    taskId: null,
    agentId: null,
    state: "CREATED",
    policyResult: null,
    approvalId: null,
    handoffId: null,
    evidenceIds: [],
    reason: "created",
  };
}

export class Orchestrator {
  readonly #deps: OrchestratorDependencies;
  readonly #records = new Map<string, OrchestrationRecord>();

  constructor(dependencies: OrchestratorDependencies) {
    this.#deps = dependencies;
  }

  start(request: OrchestrationRequest): OrchestrationResult {
    this.#assertRequest(request);
    if (this.#records.has(request.requestId)) {
      throw new OrchestratorError(
        "INVALID_REQUEST",
        `Orchestration already exists: ${request.requestId}`,
      );
    }
    if (!this.#deps.agents.has(request.assignedAgent)) {
      throw new OrchestratorError("AGENT_NOT_FOUND", `Unknown agent: ${request.assignedAgent}`);
    }
    if (!isValidToolId(request.toolId) || !this.#deps.tools.has(request.toolId)) {
      throw new OrchestratorError("INVALID_REQUEST", `Unknown tool: ${request.toolId}`);
    }

    const record: OrchestrationRecord = {
      request,
      result: emptyResult(request.requestId),
    };
    this.#records.set(request.requestId, record);

    const taskId = `task_${request.requestId}`;
    try {
      this.#deps.tasks.createTask(this.#toTask(request, taskId));
      this.#deps.tasks.assignTask(taskId, request.assignedAgent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new OrchestratorError("TASK_CREATION_FAILED", message);
    }

    this.#patch(record, {
      taskId,
      agentId: request.assignedAgent,
      reason: "task created and assigned",
    });
    this.#transition(record, "ASSIGNED");
    this.#transition(record, "POLICY_CHECK");
    this.#applyPolicy(record);
    return this.getState(request.requestId);
  }

  evaluate(requestId: string): OrchestrationResult {
    const record = this.#require(requestId);
    if (record.result.state !== "POLICY_CHECK" && record.result.state !== "WAITING_FOR_APPROVAL") {
      throw new OrchestratorError(
        "INVALID_STATE_TRANSITION",
        `Cannot evaluate policy from ${record.result.state}`,
      );
    }
    if (record.result.state === "WAITING_FOR_APPROVAL") {
      this.#transition(record, "POLICY_CHECK");
    }
    this.#applyPolicy(record);
    return this.getState(requestId);
  }

  approve(requestId: string, approvalId: string, approver: string): OrchestrationResult {
    const record = this.#require(requestId);
    if (record.result.state !== "WAITING_FOR_APPROVAL") {
      throw new OrchestratorError(
        "INVALID_STATE_TRANSITION",
        `Cannot approve from ${record.result.state}`,
      );
    }
    if (!record.result.approvalId || record.result.approvalId !== approvalId) {
      throw new OrchestratorError(
        "APPROVAL_INVALID",
        "Approval id does not belong to this orchestration",
      );
    }
    this.#deps.approvals.approve(approvalId, approver);
    this.#transition(record, "POLICY_CHECK");
    this.#applyPolicy(record);
    return this.getState(requestId);
  }

  handoff(handoff: Handoff): OrchestrationResult {
    const record = [...this.#records.values()].find(
      (item) => item.result.taskId === handoff.taskId,
    );
    if (!record) {
      throw new OrchestratorError(
        "ORCHESTRATION_NOT_FOUND",
        `No orchestration for task: ${handoff.taskId}`,
      );
    }
    const created = this.#deps.handoffs.createHandoff(handoff);
    this.#patch(record, {
      handoffId: created.handoffId,
      reason: `Handoff ${created.handoffId} registered; execution did not occur`,
    });
    return this.getState(record.request.requestId);
  }

  attachEvidence(evidence: Evidence): OrchestrationResult {
    if (evidence.provenance.executionOccurred === true) {
      throw new OrchestratorError(
        "EXECUTION_NOT_IMPLEMENTED",
        "Cannot attach execution evidence; tool execution is not implemented",
      );
    }
    const stored = this.#deps.evidence.createEvidence(evidence);
    const record = stored.taskId
      ? [...this.#records.values()].find((item) => item.result.taskId === stored.taskId)
      : undefined;
    if (!record) {
      throw new OrchestratorError(
        "ORCHESTRATION_NOT_FOUND",
        "Evidence taskId does not match an orchestration",
      );
    }
    this.#patch(record, {
      evidenceIds: [...record.result.evidenceIds, stored.evidenceId],
      reason: `Evidence ${stored.evidenceId} attached; not execution evidence`,
    });
    return this.getState(record.request.requestId);
  }

  getState(requestId: string): OrchestrationResult {
    return cloneResult(this.#require(requestId).result);
  }

  #applyPolicy(record: OrchestrationRecord): void {
    const approval =
      record.result.approvalId && this.#deps.approvals.hasApproval(record.result.approvalId)
        ? this.#deps.approvals.getApproval(record.result.approvalId)
        : null;
    const policyResult = evaluatePolicy(
      {
        requestId: record.request.requestId,
        agentId: record.request.assignedAgent,
        toolId: record.request.toolId,
        requestedPermissions: record.request.requestedPermissions,
        riskLevel: record.request.riskLevel,
        approvalId: record.result.approvalId ?? undefined,
        taskId: record.result.taskId ?? undefined,
      },
      this.#deps.agents,
      this.#deps.tools,
      approval,
    );
    this.#patch(record, { policyResult, reason: policyResult.reason });

    if (policyResult.decision === "ALLOW") {
      this.#transition(record, "AUTHORIZED");
      this.#transition(record, "READY_FOR_EXECUTION");
      this.#patch(record, {
        reason: "Policy ALLOW: authorized only. Execution is not implemented.",
      });
      return;
    }
    if (policyResult.decision === "APPROVAL_REQUIRED") {
      if (!record.result.approvalId) {
        const approvalId = `apr_${record.request.requestId}`;
        this.#deps.approvals.createApproval({
          approvalId,
          taskId: record.result.taskId as string,
          requestedAction: `${record.request.toolId}:${record.request.requestedPermissions.join(",")}`,
          riskLevel: record.request.riskLevel,
          requestedBy: record.request.assignedAgent,
          approvedBy: null,
          status: "PENDING",
          createdAt: now(),
          resolvedAt: null,
        });
        this.#patch(record, { approvalId });
      }
      this.#transition(record, "WAITING_FOR_APPROVAL");
      this.#patch(record, { reason: policyResult.reason });
      return;
    }
    this.#transition(record, "FAILED");
    this.#patch(record, { reason: `POLICY_DENIED: ${policyResult.reason}` });
    if (record.result.taskId && this.#deps.tasks.getTask(record.result.taskId).status === "READY") {
      this.#deps.tasks.transitionTask(record.result.taskId, "BLOCKED");
    }
  }

  #assertRequest(request: OrchestrationRequest): void {
    if (!isNonEmptyString(request.requestId)) {
      throw new OrchestratorError("INVALID_REQUEST", "requestId is required");
    }
    if (!isNonEmptyString(request.objective)) {
      throw new OrchestratorError("INVALID_REQUEST", "objective is required");
    }
    if (!isNonEmptyString(request.expectedOutput)) {
      throw new OrchestratorError("INVALID_REQUEST", "expectedOutput is required");
    }
    if (!isValidAgentId(request.assignedAgent)) {
      throw new OrchestratorError("AGENT_NOT_FOUND", `Unknown agent: ${request.assignedAgent}`);
    }
    if (!isValidRiskLevel(request.riskLevel)) {
      throw new OrchestratorError("INVALID_REQUEST", `Invalid riskLevel: ${request.riskLevel}`);
    }
    if (!Array.isArray(request.requestedPermissions)) {
      throw new OrchestratorError("INVALID_REQUEST", "requestedPermissions must be an array");
    }
  }

  #toTask(request: OrchestrationRequest, taskId: string): Task {
    return {
      taskId,
      title: request.objective.slice(0, 80),
      objective: request.objective,
      createdBy: request.createdBy,
      assignedTo: null,
      priority: request.riskLevel,
      status: "READY",
      riskLevel: request.riskLevel,
      inputs: {
        toolId: request.toolId,
        requestedPermissions: request.requestedPermissions,
      },
      expectedOutput: request.expectedOutput,
      dependencies: [],
      evidenceRequired: false,
      createdAt: now(),
      updatedAt: now(),
    };
  }

  #transition(record: OrchestrationRecord, to: OrchestrationState): void {
    if (!canTransitionOrchestration(record.result.state, to)) {
      throw new OrchestratorError(
        "INVALID_STATE_TRANSITION",
        `Cannot transition ${record.result.state} → ${to}`,
      );
    }
    this.#patch(record, { state: to });
  }

  #patch(record: OrchestrationRecord, patch: Partial<OrchestrationResult>): void {
    record.result = cloneResult({ ...record.result, ...patch });
  }

  #require(requestId: string): OrchestrationRecord {
    const record = this.#records.get(requestId);
    if (!record) {
      throw new OrchestratorError(
        "ORCHESTRATION_NOT_FOUND",
        `Unknown orchestration: ${requestId}`,
      );
    }
    return record;
  }
}

export function createOrchestrator(dependencies: OrchestratorDependencies): Orchestrator {
  return new Orchestrator(dependencies);
}
