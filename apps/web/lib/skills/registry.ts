/**
 * Digital Employee — SkillRegistry (Sprint 1, Unified Foundation).
 *
 * Fail-closed:
 * - ongeldig skill-contract → registratie-fout (throw, nooit herstellen);
 * - dubbele skill-id → fout;
 * - onbekende skill → null (router beslist fail-closed);
 * - invariant: riskClass R4 ⇒ approvalPolicy "REQUIRED" (NO EXCEPTIONS);
 * - allowedTools verwijzen naar ToolRegistryV2-ids; de tool-registry blijft
 *   de ENIGE uitvoeringspoort voor tools (geen directe acties vanuit code).
 */

import type { AgentSkill } from "./types.ts";
import { approvalRequiredForRiskClass, isRiskClass } from "./risk.ts";

const SKILL_ID_PATTERN = /^[a-z][a-z0-9._-]{1,63}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const APPROVAL_POLICIES = new Set(["AUTO", "POLICY", "REQUIRED"]);

function fail(reason: string): never {
  throw new Error(`INVALID_SKILL: ${reason}`);
}

export function assertValidSkill(skill: AgentSkill): AgentSkill {
  if (skill === null || typeof skill !== "object") fail("skill must be an object");
  if (typeof skill.id !== "string" || !SKILL_ID_PATTERN.test(skill.id)) {
    fail(`id must match ${SKILL_ID_PATTERN} (got ${String(skill.id)})`);
  }
  if (typeof skill.version !== "string" || !SEMVER_PATTERN.test(skill.version)) {
    fail(`version must be semver (got ${String(skill.version)})`);
  }
  if (typeof skill.description !== "string" || skill.description.trim().length === 0 || skill.description.length > 500) {
    fail("description must be a non-empty string of at most 500 characters");
  }
  if (skill.inputSchema === null || typeof skill.inputSchema !== "object" || Array.isArray(skill.inputSchema)) {
    fail("inputSchema must be an object (JSON-schema)");
  }
  if (skill.outputSchema === null || typeof skill.outputSchema !== "object" || Array.isArray(skill.outputSchema)) {
    fail("outputSchema must be an object (JSON-schema)");
  }
  if (!Array.isArray(skill.permissions) || skill.permissions.some((p) => typeof p !== "string" || p.length === 0)) {
    fail("permissions must be an array of non-empty strings");
  }
  if (!Array.isArray(skill.allowedTools) || skill.allowedTools.some((t) => typeof t !== "string" || t.length === 0)) {
    fail("allowedTools must be an array of non-empty tool ids");
  }
  if (!isRiskClass(skill.riskClass)) fail(`unknown riskClass: ${String(skill.riskClass)}`);
  if (typeof skill.approvalPolicy !== "string" || !APPROVAL_POLICIES.has(skill.approvalPolicy)) {
    fail(`unknown approvalPolicy: ${String(skill.approvalPolicy)}`);
  }
  // Invariant: R4 ⇒ REQUIRED — geen uitzonderingen.
  if (approvalRequiredForRiskClass(skill.riskClass) && skill.approvalPolicy !== "REQUIRED") {
    fail(`riskClass R4 requires approvalPolicy "REQUIRED" (got "${skill.approvalPolicy}")`);
  }
  if (typeof skill.execute !== "function") fail("execute must be a function");
  return skill;
}

export class SkillRegistry {
  readonly #skills = new Map<string, AgentSkill>();

  register(skill: AgentSkill): void {
    assertValidSkill(skill);
    if (this.#skills.has(skill.id)) {
      throw new Error(`Duplicate skill id: ${skill.id}`);
    }
    this.#skills.set(skill.id, skill);
  }

  get(id: string): AgentSkill | null {
    return this.#skills.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.#skills.has(id);
  }

  /** Stabiele volgorde = registratievolgorde (determinisme). */
  list(): readonly AgentSkill[] {
    return [...this.#skills.values()];
  }
}

export function createSkillRegistry(skills: readonly AgentSkill[] = []): SkillRegistry {
  const registry = new SkillRegistry();
  for (const skill of skills) {
    registry.register(skill);
  }
  return registry;
}
