/**
 * Agent Tool Platform — ToolRegistryV2 (app-laag, TASK 3-design).
 *
 * Fail-closed:
 * - dubbele tool-id bij registratie → fout;
 * - ongeldige ToolSpec → fout (validation.ts);
 * - onbekende/disabled/OFF-tool → isEnabled = false (DENY aan de gate);
 * - adapter null → NOT_IMPLEMENTED (resolveAdapter retourneert null).
 *
 * Tenant-aware params (tenantId) zijn vandaag placeholders: per-tenant
 * overrides komen in de TASK 25-data-laag; zolang er geen rij bestaat,
 * bepaalt de spec (tenantPolicy) het gedrag.
 */

import { assertValidToolSpec } from "./validation.ts";
import type { ToolSpec } from "./types.ts";

export interface ModelToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Readonly<Record<string, unknown>>;
  };
}

export interface ToolRegistryV2Options {
  /**
   * Expliciete operator-overrides per tool-id (bv. email_send inschakelen
   * voor een deployment). Fail-closed default blijft: zonder override is
   * spec.enabled leidend; tenantPolicy OFF wint altijd.
   */
  enabledOverrides?: Readonly<Record<string, boolean>>;
}

export class ToolRegistryV2 {
  readonly #tools = new Map<string, ToolSpec>();
  readonly #overrides: Readonly<Record<string, boolean>>;

  constructor(options: ToolRegistryV2Options = {}) {
    this.#overrides = options.enabledOverrides ?? {};
  }

  register(spec: ToolSpec): void {
    assertValidToolSpec(spec);
    if (this.#tools.has(spec.id)) {
      throw new Error(`Duplicate tool id: ${spec.id}`);
    }
    this.#tools.set(spec.id, spec);
  }

  get(id: string): ToolSpec | null {
    return this.#tools.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.#tools.has(id);
  }

  list(): readonly ToolSpec[] {
    // Stabiele volgorde = registratievolgorde (determinisme).
    return [...this.#tools.values()];
  }

  /**
   * Fail-closed: onbekende tool, disabled tool of tenantPolicy OFF → false.
   * tenantId is de TASK 25-hook (per-tenant overrides); zonder data-laag
   * is het gedrag spec-gedreven + expliciete enabledOverrides.
   */
  isEnabled(id: string, tenantId?: string): boolean {
    void tenantId; // TASK 25-hook: per-tenant overrides; vandaag spec-gedreven
    const spec = this.#tools.get(id);
    if (!spec) return false;
    if (spec.tenantPolicy === "OFF") return false; // OFF wint altijd
    const enabled = this.#overrides[id] ?? spec.enabled;
    return enabled;
  }

  /**
   * Approval vereist bij HIGH/CRITICAL (risk) óf tenantPolicy APPROVAL.
   * Fail-closed: onbekende tool → false (wordt door isEnabled al DENY).
   */
  approvalRequired(id: string, tenantId?: string): boolean {
    void tenantId; // TASK 25-hook: per-tenant overrides; vandaag spec-gedreven
    const spec = this.#tools.get(id);
    if (!spec) return false;
    if (spec.riskLevel === "HIGH" || spec.riskLevel === "CRITICAL") return true;
    if (spec.tenantPolicy === "APPROVAL") return true;
    return spec.requiresApproval;
  }

  /**
   * Adapter-resolutie: null = NOT_IMPLEMENTED (fail-closed).
   */
  resolveAdapter(id: string): string | null {
    return this.#tools.get(id)?.adapter ?? null;
  }

  /**
   * OpenAI/DeepSeek function-definities voor de model-context (tool discovery).
   * Alleen bestaande tools; disabled-tools worden NIET aan het model getoond.
   */
  toModelTools(ids: readonly string[]): ModelToolDefinition[] {
    const tools: ModelToolDefinition[] = [];
    for (const id of ids) {
      const spec = this.#tools.get(id);
      if (!spec || !spec.enabled) continue;
      tools.push({
        type: "function",
        function: {
          name: spec.id,
          description: spec.description.slice(0, 300),
          parameters: spec.inputSchema,
        },
      });
    }
    return tools;
  }
}

export function createToolRegistryV2(
  specs: readonly ToolSpec[] = [],
  options: ToolRegistryV2Options = {},
): ToolRegistryV2 {
  const registry = new ToolRegistryV2(options);
  for (const spec of specs) {
    registry.register(spec);
  }
  return registry;
}
