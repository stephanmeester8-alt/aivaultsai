export const AGENT_IDS = [
  "cto_architect",
  "research_intelligence",
  "product_ux",
  "principal_engineer",
  "growth_analytics",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export const AGENT_STATUSES = ["ACTIVE", "INACTIVE", "DEPRECATED"] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

export function isValidAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && (AGENT_IDS as readonly string[]).includes(value);
}

export function isValidAgentStatus(value: unknown): value is AgentStatus {
  return typeof value === "string" && (AGENT_STATUSES as readonly string[]).includes(value);
}
