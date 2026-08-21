import type { AgentRegistry } from "../agents/registry.ts";
import { isValidAgentId } from "../agents/ids.ts";
import { createHash } from "node:crypto";
import type { ApprovalEngine } from "../approvals/engine.ts";
import type { Evidence } from "../evidence/types.ts";
import type { EvidenceStore } from "../evidence/store.ts";
import type { Handoff } from "../handoffs/types.ts";
import type { HandoffEngine } from "../handoffs/engine.ts";
import { evaluatePolicy } from "../permissions/policy-engine.ts";
import { isValidRiskLevel } from "../permissions/risk.ts";
import { riskToPriority } from "../tasks/types.ts";
import type { TaskEngine } from "../tasks/engine.ts";
import type { Task } from "../tasks/types.ts";
import { isValidToolId } from "../tools/types.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { ToolAdapterRegistry } from "../execution/adapters.ts";
import { ExecutionGate } from "../execution/gate.ts";
import type { ExecutionResult, ExecutionStatus } from "../execution/types.ts";
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
  /**
   * Optional adapter registry. Without it, `execute()` cannot run and fails
   * closed with EXECUTION_ADAPTERS_NOT_CONFIGURED. `start()` is unaffected.
   */
  readonly adapters?: ToolAdapterRegistry;
};

type OrchestrationRecord = {
  request: OrchestrationRequest;
  result: OrchestrationResult;
};

function now(): string {
  return new Date().toISOString();
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
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
    executionResult: null,
    reason: "created",
  };
}

export class Orchestrator {
  readonly #deps: OrchestratorDependencies;
  readonly #records = new Map<string, OrchestrationRecord>();
  /** executions[executionId] = status — proof that a tool actually ran. */
  readonly #executions = new Map<string, ExecutionStatus>();

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

  /**
   * Execute an authorized orchestration. Runs ONLY from READY_FOR_EXECUTION,
   * re-checks everything through the Execution Gate, and records execution
   * evidence exclusively from the gate result — never fabricated.
   */
  async execute(requestId: string): Promise<OrchestrationResult> {
    const record = this.#require(requestId);
    if (record.result.state !== "READY_FOR_EXECUTION") {
      throw new OrchestratorError(
        "INVALID_STATE_TRANSITION",
        `Cannot execute from ${record.result.state}`,
      );
    }
    if (!this.#deps.adapters) {
      this.#patch(record, {
        reason: "EXECUTION_ADAPTERS_NOT_CONFIGURED: no adapter registry supplied",
      });
      this.#transition(record, "FAILED");
      this.#blockTask(record);
      return this.getState(requestId);
    }

    this.#transition(record, "EXECUTING");
    const taskId = record.result.taskId as string;
    try {
      this.#deps.tasks.transitionTask(taskId, "IN_PROGRESS");
    } catch {
      // Task already in a non-startable state (e.g. BLOCKED) — fail closed.
      this.#patch(record, { reason: "task could not start execution" });
      this.#transition(record, "FAILED");
      return this.getState(requestId);
    }

    const executionId = `ex_${requestId}`;
    const gate = new ExecutionGate({
      agents: this.#deps.agents,
      tasks: this.#deps.tasks,
      tools: this.#deps.tools,
      approvals: this.#deps.approvals,
      adapters: this.#deps.adapters,
    });

    const result: ExecutionResult = await gate.execute({
      executionId,
      taskId,
      agentId: record.request.assignedAgent,
      toolId: record.request.toolId,
      requestedAction: `${record.request.toolId}:${record.request.requestedPermissions.join(",")}`,
      requestedPermissions: record.request.requestedPermissions,
      riskLevel: record.request.riskLevel,
      approvalId: record.result.approvalId,
      input: record.request.input ?? {},
    });

    this.#executions.set(executionId, result.status);
    this.#patch(record, {
      executionResult: {
        executionId,
        status: result.status,
        executionOccurred: result.executionOccurred,
        error: result.error,
        inputHash: sha256(record.request.input ?? {}),
        outputHash: result.status === "SUCCEEDED" ? sha256(result.output ?? {}) : null,
      },
      reason: `execution result: ${result.status}`,
    });

    if (result.status === "SUCCEEDED") {
      this.#recordExecutionEvidence(record, result);
      try {
        this.#deps.tasks.transitionTask(taskId, "REVIEW");
      } catch {
        // Task state change is best-effort; orchestration result is authoritative.
      }
      this.#transition(record, "COMPLETED");
      this.#patch(record, { reason: "execution succeeded; evidence attached" });
    } else if (result.status === "FAILED") {
      try {
        this.#deps.tasks.failTask(taskId, result.error ?? "execution failed");
      } catch {
        /* task already terminal */
      }
      this.#transition(record, "FAILED");
      this.#patch(record, { reason: `EXECUTION_FAILED: ${result.error ?? ""}` });
    } else {
      // REJECTED or NOT_IMPLEMENTED: authorized request could not execute.
      this.#transition(record, "FAILED");
      this.#patch(record, { reason: `${result.status}: ${result.error ?? ""}` });
      this.#blockTask(record);
    }
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
      reason: `Handoff ${created.handoffId} registered`,
    });
    if (record.result.state === "COMPLETED") {
      this.#transition(record, "HANDED_OFF");
    }
    return this.getState(record.request.requestId);
  }

  attachEvidence(evidence: Evidence): OrchestrationResult {
    if (evidence.provenance.executionOccurred === true) {
      throw new OrchestratorError(
        "EXECUTION_NOT_IMPLEMENTED",
        "Execution evidence cannot be attached manually; it is only recorded from the Execution Gate result",
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

  #recordExecutionEvidence(record: OrchestrationRecord, result: ExecutionResult): void {
    const stored = this.#deps.evidence.createEvidence({
      evidenceId: `ev_${result.executionId}`,
      claim: `Tool ${result.toolId} executed (${result.executionId})`,
      type: "FACT",
      source: "execution_gate",
      sourceType: "execution",
      supportingData: JSON.stringify({
        executionId: result.executionId,
        status: result.status,
        toolId: result.toolId,
      }),
      counterEvidence: null,
      confidence: "HIGH",
      provenance: {
        actor: record.request.assignedAgent,
        toolId: result.toolId,
        capability: record.request.requestedPermissions[0] ?? null,
        method: "adapter_execute",
        origin: "system",
        executionOccurred: true,
        executionId: result.executionId,
      },
      collectedAt: now(),
      taskId: record.result.taskId,
      agentId: record.request.assignedAgent,
    });
    this.#patch(record, {
      evidenceIds: [...record.result.evidenceIds, stored.evidenceId],
    });
  }

  #blockTask(record: OrchestrationRecord): void {
    const taskId = record.result.taskId;
    if (!taskId || !this.#deps.tasks.hasTask(taskId)) return;
    try {
      const task = this.#deps.tasks.getTask(taskId);
      if (task.status === "READY" || task.status === "IN_PROGRESS") {
        this.#deps.tasks.transitionTask(taskId, "BLOCKED");
      }
    } catch {
      /* best-effort */
    }
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
        ...(record.result.approvalId ? { approvalId: record.result.approvalId } : {}),
        ...(record.result.taskId ? { taskId: record.result.taskId } : {}),
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
        reason: "Policy ALLOW: authorized only.",
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
      priority: request.priority ?? riskToPriority(request.riskLevel),
      status: "READY",
      riskLevel: request.riskLevel,
      inputs: {
        toolId: request.toolId,
        requestedPermissions: request.requestedPermissions,
        invocation: request.input ?? {},
      },
      expectedOutput: request.expectedOutput,
      dependencies: [],
      evidenceRequired: false,
      failureReason: null,
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
