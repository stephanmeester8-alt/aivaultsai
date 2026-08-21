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
import { notImplementedResult, rejectedResult } from "./result.ts";
import type { ExecutionRequest, ExecutionResult } from "./types.ts";

export type ExecutionGateDependencies = {
  readonly agents: AgentRegistry;
  readonly tasks: TaskEngine;
  readonly tools: ToolRegistry;
  readonly approvals: ApprovalEngine;
  readonly adapters: ToolAdapterRegistry;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Authorization + execution boundary. Executes ONLY when every condition
 * holds: policy ALLOW, approval satisfied (APPROVED or not required),
 * tool enabled, adapter registered, input valid. Any failure is REJECTED
 * before execution; a missing adapter is an explicit NOT_IMPLEMENTED
 * (unavailable) state. Adapters run only inside this gate — agents and the
 * orchestrator never call adapters directly.
 */
export class ExecutionGate {
  readonly #deps: ExecutionGateDependencies;

  constructor(dependencies: ExecutionGateDependencies) {
    this.#deps = dependencies;
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    if (!isNonEmptyString(request.executionId) || !isNonEmptyString(request.requestedAction)) {
      return rejectedResult(request, "Invalid execution request");
    }
    if ("authorization" in request && request.authorization == null) {
      return rejectedResult(request, "Missing authorization");
    }
    if (!isValidRiskLevel(request.riskLevel)) {
      return rejectedResult(request, `Invalid risk level: ${String(request.riskLevel)}`);
    }
    if (!isValidAgentId(request.agentId) || !this.#deps.agents.has(request.agentId)) {
      return rejectedResult(request, `Unknown agent: ${String(request.agentId)}`);
    }
    if (!isNonEmptyString(request.taskId) || !this.#deps.tasks.hasTask(request.taskId)) {
      return rejectedResult(request, `Unknown task: ${request.taskId}`);
    }
    const tool = this.#deps.tools.get(request.toolId);
    if (!tool) {
      return rejectedResult(request, `Unknown tool: ${request.toolId}`);
    }
    if (!tool.enabled) {
      return rejectedResult(request, `Tool ${tool.id} is disabled`);
    }
    if (!Array.isArray(request.requestedPermissions)) {
      return rejectedResult(request, "Invalid permission list");
    }
    const unknownPermissions = request.requestedPermissions.filter(
      (permission) => !isValidPermission(permission),
    );
    if (unknownPermissions.length > 0) {
      return rejectedResult(request, `Invalid permission: ${unknownPermissions.join(", ")}`);
    }

    const approval =
      request.approvalId && this.#deps.approvals.hasApproval(request.approvalId)
        ? this.#deps.approvals.getApproval(request.approvalId)
        : null;
    if (request.approvalId && !approval) {
      return rejectedResult(request, `Invalid approval: ${request.approvalId}`);
    }
    if (approval) {
      if (approval.taskId !== request.taskId) {
        return rejectedResult(request, "Approval is bound to a different task");
      }
      if (approval.requestedAction !== request.requestedAction) {
        return rejectedResult(request, "Approval is bound to a different action");
      }
      if (!isApprovalRiskSufficient(approval.riskLevel, request.riskLevel)) {
        return rejectedResult(request, "Approval risk is insufficient");
      }
    } else if (requiresHumanApproval(request.riskLevel)) {
      return rejectedResult(request, "APPROVAL_REQUIRED");
    }

    const policy = evaluatePolicy(
      {
        requestId: request.executionId,
        agentId: request.agentId,
        toolId: request.toolId,
        requestedPermissions: request.requestedPermissions,
        riskLevel: request.riskLevel,
        ...(request.approvalId ? { approvalId: request.approvalId } : {}),
        ...(request.taskId ? { taskId: request.taskId } : {}),
      },
      this.#deps.agents,
      this.#deps.tools,
      approval,
    );
    if (request.authorization && request.authorization.decision !== policy.decision) {
      return rejectedResult(request, "Supplied authorization does not match evaluatePolicy");
    }
    if (policy.decision === "DENY") {
      return rejectedResult(request, policy.reason);
    }
    if (policy.decision === "APPROVAL_REQUIRED") {
      return rejectedResult(request, policy.reason);
    }
    if (policy.decision !== "ALLOW") {
      return rejectedResult(request, "Authorization failed closed");
    }

    const adapter = this.#deps.adapters.getByTool(request.toolId);
    if (!adapter) {
      // Authorized but explicitly unavailable: no adapter is registered for
      // this tool (e.g. browser, terminal, mcp). Nothing may execute.
      return notImplementedResult(
        request,
        `No adapter is registered for tool ${request.toolId}; execution unavailable`,
      );
    }

    try {
      return await adapter.execute(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const timestamp = new Date().toISOString();
      return {
        executionId: request.executionId,
        status: "FAILED",
        toolId: request.toolId,
        taskId: request.taskId,
        agentId: String(request.agentId),
        output: null,
        error: `Adapter crashed: ${message}`,
        executionOccurred: true,
        startedAt: timestamp,
        completedAt: timestamp,
      };
    }
  }
}

export function createExecutionGate(dependencies: ExecutionGateDependencies): ExecutionGate {
  return new ExecutionGate(dependencies);
}
