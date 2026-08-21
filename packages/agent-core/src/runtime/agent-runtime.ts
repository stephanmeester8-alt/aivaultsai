import { randomUUID } from "node:crypto";
import type { AgentRegistry } from "../agents/registry.ts";
import type { ApprovalEngine } from "../approvals/engine.ts";
import type { EvidenceStore } from "../evidence/store.ts";
import type { HandoffEngine } from "../handoffs/engine.ts";
import type { TaskEngine } from "../tasks/engine.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { ToolAdapterRegistry } from "../execution/adapters.ts";
import { Orchestrator } from "../orchestration/orchestrator.ts";
import type { OrchestrationResult } from "../orchestration/types.ts";
import {
  NoopRunRecorder,
  type RunRecorder,
  type RunRecordKind,
} from "../persistence/types.ts";
import { RuntimeError } from "./errors.ts";
import type { AgentRun, AgentRunRequest, AgentRunState } from "./types.ts";

export type AgentRuntimeDependencies = {
  readonly agents: AgentRegistry;
  readonly tasks: TaskEngine;
  readonly handoffs: HandoffEngine;
  readonly evidence: EvidenceStore;
  readonly approvals: ApprovalEngine;
  readonly tools: ToolRegistry;
  readonly adapters: ToolAdapterRegistry;
  /** Optional append-only audit sink (e.g. Postgres). Failures are non-fatal. */
  readonly recorder?: RunRecorder;
};

function now(): string {
  return new Date().toISOString();
}

function cloneRun(run: AgentRun): AgentRun {
  return {
    ...run,
    evidenceIds: [...run.evidenceIds],
  };
}

/**
 * Agent runtime: the concrete lifecycle driver on top of the existing
 * engines. Lifecycle:
 *
 * RECEIVED → PLANNED → POLICY_CHECKED → (APPROVAL_REQUIRED → APPROVED)
 * → READY_FOR_EXECUTION → EXECUTING → COMPLETED | FAILED | HANDED_OFF
 *
 * Deterministic: every step delegates to an engine (Task, Policy, Approval,
 * Handoff, Evidence) or the Execution Gate. No hidden business logic.
 */
export class AgentRuntime {
  readonly #deps: AgentRuntimeDependencies;
  readonly #orchestrator: Orchestrator;
  readonly #recorder: RunRecorder;
  readonly #runs = new Map<string, AgentRun>();

  constructor(dependencies: AgentRuntimeDependencies) {
    this.#deps = dependencies;
    this.#recorder = dependencies.recorder ?? new NoopRunRecorder();
    this.#orchestrator = new Orchestrator({
      agents: dependencies.agents,
      tasks: dependencies.tasks,
      handoffs: dependencies.handoffs,
      evidence: dependencies.evidence,
      approvals: dependencies.approvals,
      tools: dependencies.tools,
      adapters: dependencies.adapters,
    });
  }

  /** Receive a new agent request: validate, plan, create the task, check policy. */
  submit(request: AgentRunRequest): AgentRun {
    if (!this.#deps.agents.has(request.agentId)) {
      throw new RuntimeError("AGENT_NOT_FOUND", `Unknown agent: ${request.agentId}`);
    }
    if (!request.objective || request.objective.trim().length === 0) {
      throw new RuntimeError("INVALID_RUN_REQUEST", "objective is required");
    }
    const runId = request.runId ?? `run_${randomUUID()}`;
    if (this.#runs.has(runId)) {
      throw new RuntimeError("RUN_ALREADY_EXISTS", `Run already exists: ${runId}`);
    }

    let run: AgentRun = {
      runId,
      state: "RECEIVED",
      taskId: null,
      agentId: request.agentId,
      toolId: request.toolId,
      orchestration: {
        requestId: runId,
        taskId: null,
        agentId: request.agentId,
        state: "CREATED",
        policyResult: null,
        approvalId: null,
        handoffId: null,
        evidenceIds: [],
        executionResult: null,
        reason: "received",
      },
      execution: null,
      evidenceIds: [],
      handoffId: null,
      createdAt: now(),
      updatedAt: now(),
      failureReason: null,
    };
    this.#runs.set(runId, run);

    run = this.#setState(run, "RECEIVED", "received");
    run = this.#setState(run, "PLANNED", "planned");
    const orchestration = this.#orchestrator.start({
      requestId: runId,
      objective: request.objective,
      createdBy: request.createdBy ?? "human",
      assignedAgent: request.agentId,
      toolId: request.toolId,
      requestedPermissions: request.requestedPermissions,
      riskLevel: request.riskLevel,
      expectedOutput: request.expectedOutput,
      ...(request.input ? { input: request.input } : {}),
      ...(request.priority ? { priority: request.priority } : {}),
    });
    run = this.#setState(run, "POLICY_CHECKED", "policy evaluated");
    run = this.#applyOrchestration(run, orchestration);
    this.#record(runId, "PLANNED", "task created", run, "task", {
      taskId: orchestration.taskId,
      status: orchestration.state === "FAILED" ? "BLOCKED" : "READY",
      objective: request.objective,
      expectedOutput: request.expectedOutput,
      riskLevel: request.riskLevel,
      priority: request.priority ?? null,
      assignedTo: request.agentId,
    });
    return cloneRun(run);
  }

  /** Approve a pending approval (human decision) and re-run policy. */
  approve(runId: string, approver: string): AgentRun {
    const run = this.#require(runId);
    if (run.state !== "APPROVAL_REQUIRED") {
      throw new RuntimeError(
        "INVALID_STATE_TRANSITION",
        `Cannot approve from ${run.state}`,
      );
    }
    const orchestration = this.#orchestrator.approve(
      runId,
      run.orchestration.approvalId as string,
      approver,
    );
    let next = this.#setState(run, "APPROVED", "approval granted");
    this.#record(runId, "APPROVED", "approval granted", next, "approval", {
      approvalId: orchestration.approvalId,
      decision: "APPROVED",
      approver,
    });
    next = this.#applyOrchestration(next, orchestration);
    return cloneRun(next);
  }

  /** Reject a pending approval (human decision). The run fails. */
  reject(runId: string, approver: string): AgentRun {
    const run = this.#require(runId);
    if (run.state !== "APPROVAL_REQUIRED") {
      throw new RuntimeError(
        "INVALID_STATE_TRANSITION",
        `Cannot reject from ${run.state}`,
      );
    }
    this.#deps.approvals.reject(run.orchestration.approvalId as string, approver);
    const next = this.#setState(run, "FAILED", "APPROVAL_REJECTED: human rejected the request");
    this.#record(runId, "FAILED", "approval rejected", next, "approval", {
      approvalId: run.orchestration.approvalId,
      decision: "REJECTED",
      approver,
    });
    return cloneRun(next);
  }

  /** Execute the authorized run through the Execution Gate. */
  async execute(runId: string): Promise<AgentRun> {
    const run = this.#require(runId);
    if (run.state !== "READY_FOR_EXECUTION" && run.state !== "APPROVED") {
      throw new RuntimeError(
        "INVALID_STATE_TRANSITION",
        `Cannot execute from ${run.state}`,
      );
    }
    let next = this.#setState(run, "EXECUTING", "executing");
    const orchestration = await this.#orchestrator.execute(runId);
    next = this.#applyOrchestration(next, orchestration);
    const execution = next.execution;
    if (execution) {
      this.#record(runId, "EXECUTING", "execution recorded", next, "execution", {
        executionId: execution.executionId,
        status: execution.status,
        executionOccurred: execution.executionOccurred,
        error: execution.error,
        inputHash: execution.inputHash,
        outputHash: execution.outputHash,
      });
    }
    for (const evidenceId of next.evidenceIds) {
      this.#record(runId, "COMPLETED", "evidence recorded", next, "evidence", { evidenceId });
    }
    return cloneRun(next);
  }

  /** Register a structured handoff after a completed run. */
  handoff(runId: string, handoff: Parameters<Orchestrator["handoff"]>[0]): AgentRun {
    const run = this.#require(runId);
    if (run.state !== "COMPLETED") {
      throw new RuntimeError(
        "INVALID_STATE_TRANSITION",
        `Handoff requires COMPLETED, current state: ${run.state}`,
      );
    }
    const orchestration = this.#orchestrator.handoff(handoff);
    let next = this.#applyOrchestration(run, orchestration);
    if (orchestration.state === "HANDED_OFF") {
      next = this.#setState(next, "HANDED_OFF", `handoff ${orchestration.handoffId}`);
      this.#record(runId, "HANDED_OFF", "handoff registered", next, "handoff", {
        handoffId: orchestration.handoffId,
        fromAgent: handoff.fromAgent,
        toAgent: handoff.toAgent,
      });
    }
    return cloneRun(next);
  }

  result(runId: string): AgentRun {
    return cloneRun(this.#require(runId));
  }

  list(): readonly AgentRun[] {
    return [...this.#runs.values()].map(cloneRun);
  }

  #applyOrchestration(run: AgentRun, orchestration: OrchestrationResult): AgentRun {
    const merged: AgentRun = {
      ...run,
      taskId: orchestration.taskId,
      agentId: orchestration.agentId,
      orchestration,
      execution: orchestration.executionResult,
      evidenceIds: orchestration.evidenceIds,
      handoffId: orchestration.handoffId,
      updatedAt: now(),
    };
    this.#runs.set(run.runId, merged);

    switch (orchestration.state) {
      case "WAITING_FOR_APPROVAL":
        return this.#setState(merged, "APPROVAL_REQUIRED", orchestration.reason);
      case "READY_FOR_EXECUTION":
        return this.#setState(merged, "READY_FOR_EXECUTION", orchestration.reason);
      case "COMPLETED":
        return this.#setState(merged, "COMPLETED", orchestration.reason);
      case "HANDED_OFF":
        return this.#setState(merged, "HANDED_OFF", orchestration.reason);
      case "FAILED":
        return this.#setState(
          merged,
          "FAILED",
          orchestration.reason,
          orchestration.executionResult?.error ?? null,
        );
      default:
        return merged;
    }
  }

  #setState(run: AgentRun, state: AgentRunState, reason: string, failureReason: string | null = null): AgentRun {
    const next: AgentRun = {
      ...run,
      state,
      updatedAt: now(),
      failureReason: state === "FAILED" ? (failureReason ?? reason) : null,
    };
    this.#runs.set(run.runId, next);
    this.#record(run.runId, state, reason, next);
    return next;
  }

  #record(
    runId: string,
    state: AgentRunState,
    reason: string,
    run: AgentRun,
    kind: RunRecordKind = "run",
    data?: Readonly<Record<string, unknown>>,
  ): void {
    try {
      const entry = this.#recorder.record({
        runId,
        state,
        kind,
        taskId: run.taskId,
        agentId: run.agentId,
        toolId: run.toolId,
        timestamp: now(),
        meta: { reason },
        ...(data ? { data } : {}),
      });
      if (entry && typeof (entry as Promise<void>).catch === "function") {
        (entry as Promise<void>).catch(() => {
          /* recorder failures are non-fatal */
        });
      }
    } catch {
      /* recorder failures are non-fatal */
    }
  }

  #require(runId: string): AgentRun {
    const run = this.#runs.get(runId);
    if (!run) {
      throw new RuntimeError("RUN_NOT_FOUND", `Unknown run: ${runId}`);
    }
    return run;
  }
}

export function createAgentRuntime(dependencies: AgentRuntimeDependencies): AgentRuntime {
  return new AgentRuntime(dependencies);
}
