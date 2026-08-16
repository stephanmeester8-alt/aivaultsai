export const AGENT_CAPABILITIES = [
  "ARCHITECTURE",
  "RESEARCH",
  "WEB_RESEARCH",
  "EVIDENCE_COLLECTION",
  "PRODUCT_STRATEGY",
  "UX_DESIGN",
  "ENGINEERING",
  "CODE",
  "TESTING",
  "ANALYTICS",
  "SEO",
  "GROWTH",
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export function isValidAgentCapability(value: unknown): value is AgentCapability {
  return (
    typeof value === "string" && (AGENT_CAPABILITIES as readonly string[]).includes(value)
  );
}
