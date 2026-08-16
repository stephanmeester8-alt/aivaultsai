import { INITIAL_AGENTS } from "./definitions.ts";
import { isValidAgentId, type AgentId } from "./ids.ts";
import type { AgentDefinition } from "./types.ts";

function assertNoOverlap<T extends string>(
  allowed: readonly T[],
  prohibited: readonly T[],
  label: string,
  agentId: AgentId,
): void {
  const prohibitedSet = new Set<T>(prohibited);
  const overlap = allowed.filter((item) => prohibitedSet.has(item));
  if (overlap.length > 0) {
    throw new Error(
      `Agent ${agentId} has overlapping ${label}: ${overlap.join(", ")}`,
    );
  }
}

function assertAgentDefinition(agent: AgentDefinition): void {
  if (!isValidAgentId(agent.id)) {
    throw new Error(`Unknown agent id: ${String(agent.id)}`);
  }
  if (agent.capabilities.length === 0) {
    throw new Error(`Agent ${agent.id} must declare at least one capability`);
  }
  if (agent.handoffTargets.includes(agent.id)) {
    throw new Error(`Agent ${agent.id} cannot hand off to itself`);
  }
  for (const target of agent.handoffTargets) {
    if (!isValidAgentId(target)) {
      throw new Error(`Agent ${agent.id} has unknown handoff target: ${target}`);
    }
  }
  assertNoOverlap(agent.allowedTools, agent.prohibitedTools, "tools", agent.id);
  assertNoOverlap(
    agent.allowedPermissions,
    agent.prohibitedPermissions,
    "permissions",
    agent.id,
  );
}

export class AgentRegistry {
  readonly #agents = new Map<AgentId, AgentDefinition>();

  register(agent: AgentDefinition): void {
    assertAgentDefinition(agent);
    if (this.#agents.has(agent.id)) {
      throw new Error(`Duplicate agent id: ${agent.id}`);
    }
    this.#agents.set(agent.id, agent);
  }

  get(agentId: string): AgentDefinition {
    if (!isValidAgentId(agentId)) {
      throw new Error(`Unknown agent id: ${agentId}`);
    }
    const agent = this.#agents.get(agentId);
    if (!agent) {
      throw new Error(`Unknown agent id: ${agentId}`);
    }
    return agent;
  }

  list(): readonly AgentDefinition[] {
    return [...this.#agents.values()];
  }

  has(agentId: string): boolean {
    return isValidAgentId(agentId) && this.#agents.has(agentId);
  }
}

export function createAgentRegistry(): AgentRegistry {
  return new AgentRegistry();
}

export function createInitialAgentRegistry(): AgentRegistry {
  const registry = createAgentRegistry();
  for (const agent of INITIAL_AGENTS) {
    registry.register(agent);
  }
  return registry;
}

const defaultRegistry = createInitialAgentRegistry();

export function getAgent(agentId: string): AgentDefinition {
  return defaultRegistry.get(agentId);
}
