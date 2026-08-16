import type { AgentCapability } from "../agents/capabilities.ts";
import type { AgentDefinition } from "../agents/types.ts";
import type { Approval } from "../approvals/types.ts";
import { requiresHumanApproval } from "../approvals/types.ts";
import type { ToolDefinition, ToolId } from "../tools/types.ts";
import { isValidToolId } from "../tools/types.ts";
import { agentAllowsPermission } from "./check.ts";
import {
  allow,
  approvalRequired,
  deny,
  type PolicyContext,
  type PolicyRequest,
  type PolicyResult,
} from "./policy-types.ts";
import { isValidRiskLevel, type RiskLevel } from "./risk.ts";
import { isValidPermission, type Permission } from "./types.ts";

const RISK_RANK: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

/**
 * At least one listed capability is required to request the tool.
 * This is a declarative mapping, not a runtime capability grant.
 */
export const TOOL_REQUIRED_CAPABILITIES: Record<ToolId, readonly AgentCapability[]> = {
  browser: ["WEB_RESEARCH", "RESEARCH", "SEO"],
  filesystem: ["ENGINEERING", "CODE"],
  terminal: ["ENGINEERING", "CODE"],
  http: ["RESEARCH", "WEB_RESEARCH"],
  mcp: ["ENGINEERING"],
};

export function hasRequiredCapability(
  agent: AgentDefinition,
  toolId: ToolId,
): boolean {
  const required = TOOL_REQUIRED_CAPABILITIES[toolId];
  return required.some((capability) => agent.capabilities.includes(capability));
}

export function isApprovalRiskSufficient(
  approvalRisk: RiskLevel,
  requestRisk: RiskLevel,
): boolean {
  return RISK_RANK[approvalRisk] >= RISK_RANK[requestRisk];
}

export function createPolicyContext(request: PolicyRequest): PolicyContext {
  const riskLevel = isValidRiskLevel(request.riskLevel) ? request.riskLevel : "UNKNOWN";
  return {
    request,
    agentId: null,
    toolId: request.toolId,
    riskLevel,
    requiredPermissions: [],
    missingPermissions: [],
  };
}

export function ruleUnknownOrInactiveAgent(
  context: PolicyContext,
  agent: AgentDefinition | undefined,
): PolicyResult | null {
  if (!agent) {
    return deny(context, `Unknown agent: ${context.request.agentId}`);
  }
  if (agent.status !== "ACTIVE") {
    return deny(context, `Agent ${agent.id} is ${agent.status}`);
  }
  return null;
}

export function ruleUnknownTool(
  context: PolicyContext,
  tool: ToolDefinition | undefined,
): PolicyResult | null {
  if (!isValidToolId(context.request.toolId) || !tool) {
    return deny(context, `Unknown tool: ${context.request.toolId}`);
  }
  return null;
}

export function ruleDisabledTool(
  context: PolicyContext,
  tool: ToolDefinition,
): PolicyResult | null {
  if (!tool.enabled) {
    return deny(context, `Tool ${tool.id} is disabled`);
  }
  return null;
}

export function ruleProhibitedOrUnlistedTool(
  context: PolicyContext,
  agent: AgentDefinition,
  tool: ToolDefinition,
): PolicyResult | null {
  if (agent.prohibitedTools.includes(tool.id)) {
    return deny(context, `Agent ${agent.id} is prohibited from tool ${tool.id}`);
  }
  if (!agent.allowedTools.includes(tool.id)) {
    return deny(context, `Agent ${agent.id} is not allowed to use tool ${tool.id}`);
  }
  return null;
}

export function ruleMissingCapability(
  context: PolicyContext,
  agent: AgentDefinition,
  tool: ToolDefinition,
): PolicyResult | null {
  if (!hasRequiredCapability(agent, tool.id)) {
    return deny(
      context,
      `Agent ${agent.id} lacks required capability for tool ${tool.id}`,
    );
  }
  return null;
}

export function rulePermissions(
  context: PolicyContext,
  agent: AgentDefinition,
  tool: ToolDefinition,
): PolicyResult | null {
  const requested = context.request.requestedPermissions;

  if (tool.requiredPermissions.length > 0 && requested.length === 0) {
    return deny(
      context,
      `Empty permission set is denied for tool ${tool.id}`,
      [...tool.requiredPermissions],
    );
  }

  const unknown = requested.filter((permission) => !isValidPermission(permission));
  if (unknown.length > 0) {
    return deny(context, `Unknown permission: ${unknown.join(", ")}`, unknown);
  }

  const typedRequested = requested.filter(isValidPermission);
  const unsupported = typedRequested.filter(
    (permission) => !tool.requiredPermissions.includes(permission),
  );
  if (unsupported.length > 0) {
    return deny(
      context,
      `Permission not applicable to tool ${tool.id}: ${unsupported.join(", ")}`,
      unsupported,
    );
  }

  const missing = typedRequested.filter(
    (permission) => !agentAllowsPermission(agent, permission),
  );
  if (missing.length > 0) {
    return deny(
      context,
      `Agent ${agent.id} is not allowed permission: ${missing.join(", ")}`,
      missing,
    );
  }

  return null;
}

export function ruleInvalidRisk(context: PolicyContext): PolicyResult | null {
  if (context.riskLevel === "UNKNOWN") {
    return deny(context, `Unknown risk level: ${context.request.riskLevel}`);
  }
  return null;
}

export function ruleRiskAndApproval(
  context: PolicyContext,
  agent: AgentDefinition,
  approval: Approval | null,
): PolicyResult | null {
  if (context.riskLevel === "UNKNOWN") {
    return deny(context, `Unknown risk level: ${context.request.riskLevel}`);
  }
  if (!requiresHumanApproval(context.riskLevel)) {
    return null;
  }

  if (!approval) {
    if (context.request.approvalId) {
      return deny(
        context,
        `Approval ${context.request.approvalId} was not provided for validation`,
      );
    }
    return approvalRequired(
      context,
      `${context.riskLevel} risk requires human approval`,
    );
  }

  if (context.request.approvalId && approval.approvalId !== context.request.approvalId) {
    return deny(context, "Approval id does not match the request");
  }

  if (approval.requestedBy !== agent.id) {
    return deny(context, "Approval was not requested by this agent");
  }

  if (!context.request.taskId || approval.taskId !== context.request.taskId) {
    return deny(context, "Approval taskId does not match the request context");
  }

  if (approval.status === "REJECTED") {
    return deny(context, "Approval was rejected");
  }

  if (approval.status === "PENDING" || approval.status === "EXPIRED") {
    return approvalRequired(
      context,
      `Approval is ${approval.status}; ${context.riskLevel} risk cannot proceed`,
    );
  }

  if (approval.status !== "APPROVED") {
    return deny(context, `Invalid approval status: ${approval.status}`);
  }

  if (!isApprovalRiskSufficient(approval.riskLevel, context.riskLevel)) {
    return deny(
      context,
      `Approval risk ${approval.riskLevel} is insufficient for ${context.riskLevel}`,
    );
  }

  return null;
}

export function allowIfChecksPassed(context: PolicyContext): PolicyResult {
  return allow(
    context,
    `Agent ${context.request.agentId} is authorized for tool ${context.request.toolId}`,
  );
}
