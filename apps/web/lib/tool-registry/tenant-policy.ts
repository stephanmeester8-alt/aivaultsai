/**
 * Agent Tool Platform — tenant tool policies (TASK 25, tenant-tool-policies.md §4).
 *
 * Eén resolutie-bron: spec + optionele tenant-rij → { enabled, approvalRequired }.
 * Deze functie voedt registry (isEnabled/approvalRequired), gate
 * (resolveApprovalRequirement) en discovery (via registry) — geen drie
 * parallelle implementaties.
 *
 * Fail-closed:
 * - geen rij → spec-default (backwards compatible: bestaande tenants gedragen
 *   zich exact als vandaag tot een operator een rij schrijft);
 * - OFF wint altijd (tool bestaat niet voor deze tenant — geen approval voor
 *   iets dat nooit mag);
 * - load-fout (DB-down) → approval verplicht (bij onzekerheid dicht);
 * - rijen zijn operator-data: geen write-pad vanuit tools/modellen.
 */

import type { RiskLevel, ToolSpec } from "./types.ts";

export type TenantPolicyValue = "OFF" | "ON" | "APPROVAL";

export interface TenantPolicyRow {
  policy: TenantPolicyValue;
}

export interface ResolvedToolPolicy {
  enabled: boolean;
  approvalRequired: boolean;
}

/** Spec.tenantPolicy kan ook "TENANT" zijn; de rij alleen OFF/ON/APPROVAL. */
export function resolveTenantToolPolicy(
  spec: ToolSpec,
  row: TenantPolicyRow | null,
): ResolvedToolPolicy {
  // OFF wint altijd (spec of rij): de tool bestaat niet voor deze tenant.
  if (row?.policy === "OFF" || spec.tenantPolicy === "OFF") {
    return { enabled: false, approvalRequired: false };
  }
  const riskApproval = spec.riskLevel === "HIGH" || spec.riskLevel === "CRITICAL";
  if (row) {
    // Expliciete operator-rij: ON/APPROVAL schakelt de tool in voor deze
    // tenant (operator-keuze; approval volgt risk/APPROVAL).
    return {
      enabled: true,
      approvalRequired: riskApproval || row.policy === "APPROVAL",
    };
  }
  // Geen rij → spec-default (fail-closed, backwards compatible): bestaande
  // tenants gedragen zich exact als vandaag tot een operator een rij schrijft.
  return {
    enabled: spec.enabled,
    approvalRequired: riskApproval || spec.tenantPolicy === "APPROVAL" || spec.requiresApproval,
  };
}

export interface ApprovalRequirement {
  required: boolean;
  secondApproval: boolean;
}

export type TenantPolicyLoader = (
  tenantId: string,
  toolId: string,
) => Promise<TenantPolicyRow | null>;

/**
 * TASK 6-interface, nu met data-laag. CRITICAL vereist altijd tweede ogen
 * (ongeacht tenant-rij); HIGH altijd approval; MEDIUM alleen bij een
 * APPROVAL-rij. Load-fout → fail-closed: approval verplicht.
 */
export async function resolveApprovalRequirement(
  tenantId: string,
  toolId: string,
  riskLevel: RiskLevel,
  loadRow: TenantPolicyLoader,
): Promise<ApprovalRequirement> {
  if (riskLevel === "CRITICAL") return { required: true, secondApproval: true };
  if (riskLevel === "HIGH") return { required: true, secondApproval: false };
  let row: TenantPolicyRow | null = null;
  try {
    row = await loadRow(tenantId, toolId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[tenant-policy] load failed for ${toolId} (fail-closed): ${message.slice(0, 200)}`);
    return { required: true, secondApproval: false }; // bij onzekerheid approval eisen
  }
  return { required: row?.policy === "APPROVAL", secondApproval: false };
}

export type TenantPolicySql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

/**
 * Data-loading: alle rijen voor één tenant in één query (tenant-scoped —
 * cross-tenant leakage is onmogelijk). Ongeldige policy-waarden worden
 * overgeslagen (fail-closed: een kapotte rij forceert nooit ON).
 */
export async function loadTenantToolPolicies(
  sql: TenantPolicySql,
  tenantId: string,
): Promise<ReadonlyMap<string, TenantPolicyRow>> {
  const rows = await sql`
    SELECT tool_id, policy FROM tenant_tool_policies
    WHERE tenant_id = ${tenantId}::uuid
  `;
  const VALID = new Set<TenantPolicyValue>(["OFF", "ON", "APPROVAL"]);
  const map = new Map<string, TenantPolicyRow>();
  for (const row of rows as { tool_id?: unknown; policy?: unknown }[]) {
    const toolId = row?.tool_id;
    const policy = row?.policy;
    if (typeof toolId === "string" && toolId.length > 0 && typeof policy === "string" && VALID.has(policy as TenantPolicyValue)) {
      map.set(toolId, { policy: policy as TenantPolicyValue });
    }
  }
  return map;
}
