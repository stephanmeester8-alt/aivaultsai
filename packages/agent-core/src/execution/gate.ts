import type { AgentRegistry } from "../agents/registry.ts";
import { isValidAgentId } from "../agents/ids.ts";
import type { ApprovalEngine } from "../approvals/engine.ts";
import { requiresHumanApproval } from "../approvals/types.ts";
import { isApprovalRiskSufficient } from "../permissions/policy-rules.ts";
import { evaluatePolicy } from "../permissions/policy-engine.ts";
import { isValidPermission } from "../permissions/types.ts";
import { isValidRiskLevel } from "../permissions/risk.ts";
import type { TaskEngine } from "../tasks/engine.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { ToolAdapterRegistry } from "./adapters.ts";
import type { ExecutionRequest, ExecutionResult } from "./types.ts";

export type ExecutionGateDependencies = {
  readonly agents: AgentRegistry;
  readonly tasks: TaskEngine;
  readonly tools: ToolRegistry;
  readonly approvals: ApprovalEngine;
  readonly adapters: ToolAdapterRegistry;
};

function now(): string {
  return new Date().toISOString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function rejected(request: ExecutionRequest, error: string): ExecutionResult {
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

function notImplemented(request: ExecutionRequest, error: string): ExecutionResult {
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

export class ExecutionGate {
  readonly #deps: ExecutionGateDependencies;

  constructor(dependencies: ExecutionGateDependencies) {
    this.#deps = dependencies;
  }

  /**
   * Authorization + adapter boundary. Never executes tools in this phase.
   * Does not call adapter.execute(). Does not write execution evidence.
   */
  execute(request: ExecutionRequest): ExecutionResult {
    if (!isNonEmptyString(request.executionId) || !isNonEmptyString(request.requestedAction)) {
      return rejected(request, "Invalid execution request");
    }
    if ("authorization" in request && request.authorization == null) {
      return rejected(request, "Missing authorization");
    }
    if (!isValidRiskLevel(request.riskLevel)) {
      return rejected(request, `Invalid risk level: ${String(request.riskLevel)}`);
    }
    if (!isValidAgentId(request.agentId) || !this.#deps.agents.has(request.agentId)) {
      return rejected(request, `Unknown agent: ${String(request.agentId)}`);
    }
    if (!isNonEmptyString(request.taskId) || !this.#deps.tasks.hasTask(request.taskId)) {
      return rejected(request, `Unknown task: ${request.taskId}`);
    }
    const tool = this.#deps.tools.get(request.toolId);
    if (!tool) {
      return rejected(request, `Unknown tool: ${request.toolId}`);
    }
    if (!tool.enabled) {
      return rejected(request, `Tool ${tool.id} is disabled`);
    }
    if (!Array.isArray(request.requestedPermissions)) {
      return rejected(request, "Invalid permission list");
    }
    const unknownPermissions = request.requestedPermissions.filter(
      (permission) => !isValidPermission(permission),
    );
    if (unknownPermissions.length > 0) {
      return rejected(request, `Invalid permission: ${unknownPermissions.join(", ")}`);
    }

    const approval =
      request.approvalId && this.#deps.approvals.hasApproval(request.approvalId)
        ? this.#deps.approvals.getApproval(request.approvalId)
        : null;
    if (request.approvalId && !approval) {
      return rejected(request, `Invalid approval: ${request.approvalId}`);
    }
    if (approval) {
      if (approval.taskId !== request.taskId) {
        return rejected(request, "Approval is bound to a different task");
      }
      if (approval.requestedAction !== request.requestedAction) {
        return rejected(request, "Approval is bound to a different action");
      }
      if (!isApprovalRiskSufficient(approval.riskLevel, request.riskLevel)) {
        return rejected(request, "Approval risk is insufficient");
      }
    } else if (requiresHumanApproval(request.riskLevel)) {
      return rejected(request, "APPROVAL_REQUIRED");
    }

    const policy = evaluatePolicy(
      {
        requestId: request.executionId,
        agentId: request.agentId,
        toolId: request.toolId,
        requestedPermissions: request.requestedPermissions,
        riskLevel: request.riskLevel,
        approvalId: request.approvalId ?? undefined,
        taskId: request.taskId,
      },
      this.#deps.agents,
      this.#deps.tools,
      approval,
    );
    if (request.authorization && request.authorization.decision !== policy.decision) {
      return rejected(request, "Supplied authorization does not match evaluatePolicy");
    }
    if (policy.decision === "DENY") {
      return rejected(request, policy.reason);
    }
    if (policy.decision === "APPROVAL_REQUIRED") {
      return rejected(request, policy.reason);
    }
    if (policy.decision !== "ALLOW") {
      return rejected(request, "Authorization failed closed");
    }

    const adapter = this.#deps.adapters.getByTool(request.toolId);
    if (!adapter) {
      return notImplemented(
        request,
        "No tool adapter is registered; execution is not implemented",
      );
    }
    return notImplemented(
      request,
      "Tool adapters are not invoked in this phase; execution is not implemented",
    );
  }
}

export function createExecutionGate(dependencies: ExecutionGateDependencies): ExecutionGate {
  return new ExecutionGate(dependencies);
}
