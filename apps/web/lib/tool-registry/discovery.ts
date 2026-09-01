/**
 * Agent Tool Platform — Tool Discovery (TASK 7-design).
 *
 * Pure, deterministische functie: geen I/O, geen LLM. Discovery is GEEN
 * autorisatie — de gate doet alle checks per call opnieuw. Fail-closed:
 * onbekende intent → lege set (geen "gok-tools"); disabled/adapterloze
 * tools worden nooit aangeboden.
 */

import type { ToolRegistryV2 } from "./registry.ts";
import type { RiskLevel, ToolCategory, ToolSpec } from "./types.ts";

const RISK_RANK: Readonly<Record<RiskLevel, number>> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

/** Kleine Nederlandse stopwoordlijst (intent-normalisatie). */
const STOPWORDS = new Set([
  "de", "het", "een", "en", "of", "ik", "wil", "wil", "voor", "met", "naar",
  "op", "van", "in", "aan", "dat", "die", "je", "mij", "mijn", "we", "ons",
  "graag", "even", "eens", "tools", "tool", "kan", "kunnen", "moet", "zou",
]);

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 16;
const MIN_SCORE = 1;

/** Minimale agent-gegevens voor de discovery-filters (allowedTools/permissions/max_risk). */
export interface DiscoveryAgent {
  readonly id?: string; // label (bv. "autonomous-employee"); filters komen uit de velden hieronder
  readonly allowedTools?: readonly string[];
  readonly allowedPermissions?: readonly string[];
  readonly riskLevel?: RiskLevel;
}

export interface ToolDiscoveryInput {
  intent: string; // natuurlijke taal, bv. "Ik wil websites onderzoeken"
  agentId: string; // principal (label voor consistentie; filters komen uit agent)
  tenantId?: string; // TASK 25-hook
  limit?: number; // default 8, max 16
  categories?: readonly ToolCategory[]; // optionele scope-beperking
}

export interface DiscoveryResult {
  tools: readonly ToolSpec[]; // gesorteerd: score desc · risk asc · id asc
  intent: string;
  matchedCategories: readonly ToolCategory[];
  truncated: boolean; // limit overschreden?
  /** Tool-ids die voor deze tenant approval vereisen (TASK 7 §6: markeer, verberg niet). */
  approvalRequired: readonly string[];
}

export function normalizeIntent(intent: string): string[] {
  return intent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

/**
 * Token-match: exact, óf prefix-match bij ≥ 4 tekens (vangt Nederlandse
 * verbuigingen: "websites" ↔ "website", "onderzoeken" ↔ "onderzoek").
 * Determinisme blijft gegarandeerd (pure functie van twee strings).
 */
function tokenMatches(intentToken: string, keywordToken: string): boolean {
  if (intentToken === keywordToken) return true;
  if (keywordToken.length >= 4 && keywordToken.length <= intentToken.length) {
    return intentToken.startsWith(keywordToken);
  }
  if (intentToken.length >= 4 && intentToken.length <= keywordToken.length) {
    return keywordToken.startsWith(intentToken);
  }
  return false;
}

function scoreTool(spec: ToolSpec, intentTokens: readonly string[]): number {
  let score = 0;

  // keyword-exact/prefix-match (zwaarst, gewicht 3)
  for (const keyword of spec.keywords ?? []) {
    const keywordTokens = keyword.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (const keywordToken of keywordTokens) {
      if (intentTokens.some((token) => tokenMatches(token, keywordToken))) score += 3;
    }
  }

  // category-naam match (gewicht 2)
  const categoryToken = spec.category.toLowerCase();
  if (intentTokens.some((token) => tokenMatches(token, categoryToken))) score += 2;

  // description-overlap (gewicht 1)
  const descriptionTokens = new Set(
    spec.description.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
  );
  for (const token of intentTokens) {
    for (const descriptionToken of descriptionTokens) {
      if (tokenMatches(token, descriptionToken)) {
        score += 1;
        break; // één overlap per intent-token
      }
    }
  }

  return score;
}

function passesAgentFilters(spec: ToolSpec, agent: DiscoveryAgent | null): boolean {
  if (!agent) return true;
  if (agent.allowedTools && !agent.allowedTools.includes(spec.id)) return false;
  if (agent.allowedPermissions && agent.allowedPermissions.length > 0) {
    const hasPermission = spec.permissions.some((permission) =>
      agent.allowedPermissions!.includes(permission),
    );
    if (!hasPermission) return false;
  }
  if (agent.riskLevel && RISK_RANK[spec.riskLevel] > RISK_RANK[agent.riskLevel]) return false;
  return true;
}

/**
 * Discovery-pipeline: normaliseer → score → filter (fail-closed) → rank → limit.
 * Pure functie: geen I/O, geen mutatie; deterministisch (zelfde input = zelfde output).
 */
export function discoverTools(
  input: ToolDiscoveryInput,
  registry: ToolRegistryV2,
  agent: DiscoveryAgent | null = null,
): DiscoveryResult {
  const intentTokens = normalizeIntent(input.intent);
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  interface Scored {
    spec: ToolSpec;
    score: number;
  }
  const scored: Scored[] = [];

  for (const spec of registry.list()) {
    // Scope-beperking door de caller.
    if (input.categories && !input.categories.includes(spec.category)) continue;
    // Fail-closed filters (enabled + tenantPolicy OFF via registry).
    if (!registry.isEnabled(spec.id, input.tenantId)) continue;
    // NOT_IMPLEMENTED-tools worden niet aangeboden.
    if (registry.resolveAdapter(spec.id) === null) continue;
    // Agent-filters (allowedTools / permissions / max_risk).
    if (!passesAgentFilters(spec, agent)) continue;

    const score = scoreTool(spec, intentTokens);
    if (score < MIN_SCORE) continue;
    scored.push({ spec, score });
  }

  // Ranking: score desc · risk asc · id asc (stabiel, deterministisch).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const riskDiff = RISK_RANK[a.spec.riskLevel] - RISK_RANK[b.spec.riskLevel];
    if (riskDiff !== 0) return riskDiff;
    return a.spec.id < b.spec.id ? -1 : a.spec.id > b.spec.id ? 1 : 0;
  });

  const truncated = scored.length > limit;
  const tools = scored.slice(0, limit).map((entry) => entry.spec);
  const matchedCategories = [...new Set(tools.map((tool) => tool.category))];
  const approvalRequired = tools
    .filter((tool) => registry.approvalRequired(tool.id, input.tenantId))
    .map((tool) => tool.id);

  return {
    tools,
    intent: input.intent,
    matchedCategories,
    truncated,
    approvalRequired,
  };
}
