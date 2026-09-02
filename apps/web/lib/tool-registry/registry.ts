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
import { resolveTenantToolPolicy, type TenantPolicyRow } from "./tenant-policy.ts";

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

  /**
   * Tenant-policy-resolver (TASK 25): sync lookup naar een geladen
   * tenant_tool_policies-rij (data-laag: loadTenantToolPolicies). Zonder
   * resolver (of zonder tenantId) blijft het gedrag spec-gedreven —
   * backwards compatible. Rij = OFF wint altijd (fail-closed).
   */
  tenantPolicyResolver?: (tenantId: string, toolId: string) => TenantPolicyRow | null;
}

export class ToolRegistryV2 {
  readonly #tools = new Map<string, ToolSpec>();
  readonly #overrides: Readonly<Record<string, boolean>>;
  readonly #policyResolver: ((tenantId: string, toolId: string) => TenantPolicyRow | null) | null;

  constructor(options: ToolRegistryV2Options = {}) {
    this.#overrides = options.enabledOverrides ?? {};
    this.#policyResolver = options.tenantPolicyResolver ?? null;
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
   * Met tenantId + tenantPolicyResolver (TASK 25) wint de tenant-rij
   * (OFF → altijd uit; ON/APPROVAL → spec-default risk-based); zonder
   * tenant-rij of zonder resolver is het gedrag spec-gedreven +
   * expliciete enabledOverrides.
   */
  isEnabled(id: string, tenantId?: string): boolean {
    const spec = this.#tools.get(id);
    if (!spec) return false;
    if (tenantId && this.#policyResolver) {
      return resolveTenantToolPolicy(spec, this.#policyResolver(tenantId, id)).enabled;
    }
    if (spec.tenantPolicy === "OFF") return false; // OFF wint altijd
    const enabled = this.#overrides[id] ?? spec.enabled;
    return enabled;
  }

  /**
   * Approval vereist bij HIGH/CRITICAL (risk) óf tenantPolicy APPROVAL.
   * Met tenantId + tenantPolicyResolver (TASK 25) beslist de tenant-rij
   * (APPROVAL → ook MEDIUM; OFF → nooit approval, tool bestaat niet).
   * Fail-closed: onbekende tool → false (wordt door isEnabled al DENY).
   */
  approvalRequired(id: string, tenantId?: string): boolean {
    const spec = this.#tools.get(id);
    if (!spec) return false;
    if (tenantId && this.#policyResolver) {
      return resolveTenantToolPolicy(spec, this.#policyResolver(tenantId, id)).approvalRequired;
    }
    if (spec.riskLevel === "HIGH" || spec.riskLevel === "CRITICAL") return true;
    if (spec.tenantPolicy === "APPROVAL") return true;
    return spec.requiresApproval;
  }

  /**
   * Expliciete tenant-policy OFF (spec.tenantPolicy of tenant-rij)? De gate
   * retourneert dan TENANT_POLICY i.p.v. TOOL_DISABLED (TASK 25 §6).
   * Onbekende tool → false (wordt door get() elders UNKNOWN_TOOL).
   */
  isTenantPolicyOff(id: string, tenantId?: string): boolean {
    const spec = this.#tools.get(id);
    if (!spec) return false;
    if (tenantId && this.#policyResolver) {
      return this.#policyResolver(tenantId, id)?.policy === "OFF";
    }
    return spec.tenantPolicy === "OFF";
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
