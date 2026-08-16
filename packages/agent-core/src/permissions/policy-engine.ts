import type { AgentRegistry } from "../agents/registry.ts";
import { isValidAgentId } from "../agents/ids.ts";
import type { Approval } from "../approvals/types.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import {
  allowIfChecksPassed,
  createPolicyContext,
  ruleDisabledTool,
  ruleInvalidRisk,
  ruleMissingCapability,
  rulePermissions,
  ruleProhibitedOrUnlistedTool,
  ruleRiskAndApproval,
  ruleUnknownOrInactiveAgent,
  ruleUnknownTool,
} from "./policy-rules.ts";
import { deny, type PolicyRequest, type PolicyResult } from "./policy-types.ts";

/**
 * Pure authorization decision. No I/O, no execution, no LLM.
 * Defaults to DENY. Unknown values fail closed.
 */
export function evaluatePolicy(
  request: PolicyRequest,
  agentRegistry: AgentRegistry,
  toolRegistry: ToolRegistry,
  approval: Approval | null,
): PolicyResult {
  const context = createPolicyContext(request);

  const agent =
    isValidAgentId(request.agentId) && agentRegistry.has(request.agentId)
      ? agentRegistry.get(request.agentId)
      : undefined;
  const unknownAgent = ruleUnknownOrInactiveAgent(context, agent);
  if (unknownAgent) {
    return unknownAgent;
  }
  if (!agent) {
    return deny(context, `Unknown agent: ${request.agentId}`);
  }

  const tool = toolRegistry.get(request.toolId);
  const withTool = {
    ...context,
    requiredPermissions: tool?.requiredPermissions ?? [],
  };

  const unknownTool = ruleUnknownTool(withTool, tool);
  if (unknownTool) {
    return unknownTool;
  }
  if (!tool) {
    return deny(withTool, `Unknown tool: ${request.toolId}`);
  }

  return (
    ruleDisabledTool(withTool, tool) ??
    ruleProhibitedOrUnlistedTool(withTool, agent, tool) ??
    ruleMissingCapability(withTool, agent, tool) ??
    rulePermissions(withTool, agent, tool) ??
    ruleInvalidRisk(withTool) ??
    ruleRiskAndApproval(withTool, agent, approval) ??
    allowIfChecksPassed(withTool)
  );
}
