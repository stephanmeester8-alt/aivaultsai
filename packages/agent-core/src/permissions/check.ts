import type { AgentDefinition } from "../agents/types.ts";
import type { Permission, PermissionDecision } from "./types.ts";

/**
 * Declarative permission lookup against an AgentDefinition.
 * This is not a policy engine and does not authorize runtime execution.
 */
export function checkAgentPermission(
  agent: AgentDefinition,
  permission: Permission,
): PermissionDecision {
  if (agent.prohibitedPermissions.includes(permission)) {
    return {
      allowed: false,
      permission,
      reason: `Permission ${permission} is prohibited for agent ${agent.id}`,
    };
  }
  if (agent.allowedPermissions.includes(permission)) {
    return {
      allowed: true,
      permission,
      reason: `Permission ${permission} is declared allowed for agent ${agent.id}`,
    };
  }
  return {
    allowed: false,
    permission,
    reason: `Permission ${permission} is not declared for agent ${agent.id}`,
  };
}

export function agentAllowsPermission(
  agent: AgentDefinition,
  permission: Permission,
): boolean {
  return checkAgentPermission(agent, permission).allowed;
}
