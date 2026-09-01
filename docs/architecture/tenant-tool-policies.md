# Agent Tool Platform — Tenant Tool Policies (TASK 25)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op observability (TASK 24).
> Doel (FASE 9): tools worden **tenant-aware** — per tenant is een tool OFF, ON of APPROVAL. De `tenantPolicy`-hooks uit TASK 3/6/7 worden actief via een data-laag (`tenant_tool_policies`). **Fail-closed default: geen rij = spec-default; nooit globale permissies zonder tenant-context.**

---

## 1. Uitgangspunt: bestaande situatie (FACT)

```ts
// TASK 3 (tool-registry-design.md): ToolSpec.tenantPolicy = "OFF" | "ON" | "APPROVAL" | "TENANT"
// TASK 3-API: isEnabled(id, tenantId?) / approvalRequired(id, tenantId?)  // tenantId bestond al als parameter
// TASK 6 §8: resolveApprovalRequirement(tenantId, toolId, riskLevel)
//            → { required: boolean; secondApproval: boolean }   // data-laag: "implementatie volgt in TASK 25"
// TASK 7 §6: discovery-filter "tenant-policy OFF → uit" (TASK 25-hook)
// TASK 4: "Nooit globale permissies zonder tenant context."
// prospect_tenants (migratie 003): tenant_id UUID — de tenant-entiteit bestaat al.
```

- **Gevolg (FACT):** vandaag heeft elke tool één statische spec (`tenantPolicy`), zonder per-tenant overrides; de hooks zijn ontworpen maar niet geactiveerd. Employee/orchestrator dragen `tenantId` al in elke call-context (EmployeeToolContext) — de drager bestaat, de policy-laag niet.

## 2. Doel & principe

```text
TENANT A: website_research=ON, github_read=ON,  email_send=OFF        (FASE 9-voorbeeld)
TENANT B: website_research=ON, crm=ON,          email_draft=ON, email_send=APPROVAL
TENANT C: autonomous_employee=ON,               github_write=APPROVAL

RESOLUTIE (per tool-call):
  tenant_tool_policies (rij) → OFF   → tool bestaat niet voor deze tenant (gate DENY + discovery uit)
                              → ON    → spec-default (risk-based approval)
                              → APPROVAL → approval ook voor MEDIUM; HIGH/CRITICAL altijd
  geen rij                    → spec-default (fail-closed: geen impliciete ON/OFF)
  onbekende tenant            → DENY (geen toegang zonder geldige tenant)
```

- **Policy is operator-data, geen model-keuze:** rijen worden alleen door operators/administratie geschreven; geen enkele tool kan zijn eigen tenant-policy wijzigen.
- **Eén resolutie-functie** voedt registry (`isEnabled`/`approvalRequired`), gate (`resolveApprovalRequirement`) en discovery (filter) — geen drie parallelle implementaties.

## 3. Data-model (migratie 008, voorstel)

```sql
CREATE TABLE IF NOT EXISTS tenant_tool_policies (
  tenant_id    UUID NOT NULL REFERENCES prospect_tenants(tenant_id) ON DELETE CASCADE,
  tool_id      TEXT NOT NULL,
  policy       TEXT NOT NULL CHECK (policy IN ('OFF','ON','APPROVAL')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_tool_policies_pk PRIMARY KEY (tenant_id, tool_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_tool_policies_tool ON tenant_tool_policies(tool_id);

DROP TRIGGER IF EXISTS tenant_tool_policies_set_updated_at ON tenant_tool_policies;
CREATE TRIGGER tenant_tool_policies_set_updated_at BEFORE UPDATE ON tenant_tool_policies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- **Geen rij = spec-default** (fail-closed, backwards compatible): bestaande tenants gedragen zich exact als vandaag tot een operator een rij schrijft.
- **OFF is expliciet:** een tool kan alleen per tenant worden uitgezet door een rij met `OFF`; afwezigheid betekent nooit automatisch ON.

## 4. Resolutie (copy-ready, `apps/web/lib/tool-registry/tenant-policy.ts`)

```ts
interface TenantPolicyRow { policy: "OFF" | "ON" | "APPROVAL" }

// Eén bron van waarheid: spec + optionele tenant-rij
function resolveTenantToolPolicy(
  spec: ToolSpec,
  row: TenantPolicyRow | null,
): { enabled: boolean; approvalRequired: boolean } {
  const policy = row?.policy ?? spec.tenantPolicy;          // geen rij → spec-default
  if (policy === "OFF") return { enabled: false, approvalRequired: false };
  const riskApproval = spec.riskLevel === "HIGH" || spec.riskLevel === "CRITICAL";
  return {
    enabled: true,
    approvalRequired: riskApproval || policy === "APPROVAL", // APPROVAL → ook MEDIUM
  };
}

// TASK 6-interface, nu met data-laag:
async function resolveApprovalRequirement(
  tenantId: string,
  toolId: string,
  riskLevel: RiskLevel,
  loadRow: (tenantId: string, toolId: string) => Promise<TenantPolicyRow | null>,
): Promise<{ required: boolean; secondApproval: boolean }> {
  if (riskLevel === "CRITICAL") return { required: true, secondApproval: true };  // tweede ogen
  if (riskLevel === "HIGH")     return { required: true, secondApproval: false };
  const row = await loadRow(tenantId, toolId);
  return { required: row?.policy === "APPROVAL", secondApproval: false };         // MEDIUM: alleen tenant-APPROVAL
}
```

- `secondApproval: true` alleen bij CRITICAL (TASK 6: `requiredApprovals: 2`, `PARTIALLY_APPROVED`) — ongeacht tenant-rij.
- `OFF` + approval: OFF wint (tool bestaat niet; er wordt geen approval gevraagd voor iets dat nooit mag — fail-closed).

## 5. Integratiepunten (implementatie later)

| Laag | Wijziging |
|---|---|
| Registry (`ToolRegistryV2.isEnabled/approvalRequired`) | tenantId-parameter wordt actief via `resolveTenantToolPolicy` |
| Gate/adapters | `ctx.tenantId` verplicht; `resolveApprovalRequirement` vóór approval-aanmaak; `OFF` → DENY (`TENANT_POLICY`) |
| Discovery (TASK 7) | filter `tenantPolicy === OFF` → uitgesloten (was TASK 25-hook) |
| Employee/orchestrator | bestaat al: `EmployeeToolContext.tenantId` — geen wijziging nodig |
| Observability (TASK 24) | records dragen tenantId (al zo) — per-tenant dashboards mogelijk |
| Operators | admin-route schrijft rijen (buiten deze taak; hier alleen de laag) |

## 6. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| Onbekende tenant | DENY (geen geldige tenant-context) |
| Geen rij + spec-default ON | tool beschikbaar; approval volgens risk |
| Geen rij + spec-default APPROVAL/OFF | respectievelijk approval / niet beschikbaar |
| Rij = OFF | DENY (`TENANT_POLICY`) + uit discovery |
| Rij = APPROVAL + MEDIUM-tool | APPROVAL_REQUIRED (approval ook voor MEDIUM) |
| HIGH/CRITICAL zonder approval | APPROVAL_REQUIRED (altijd, ongeacht rij) |
| CRITICAL | tweede ogen verplicht (`secondApproval: true`) |
| Approval REJECTED/EXPIRED | DENY (bestaand engine-gedrag) |
| Tool zonder `tenantId` in ctx | DENY (geen globale calls — TASK 4-principe) |

## 7. Security

- **Geen globale permissies:** elke tool-call vereist `tenantId`; een call zonder tenant-context wordt geweigerd (fail-closed) — niet "best effort".
- Policies zijn operator-data: geen tool/model kan zijn eigen policy muteren; de tabel heeft geen tool-write-pad.
- Tenant-isolatie: rijen zijn per (tenant, tool); cross-tenant leakage is onmogelijk (FK + PK op tenant_id).
- Audit/observability labelen tenantId (TASK 24) — per-tenant naleving controleerbaar.

## 8. Backwards compatibility & migratie

- Additive: zonder rijen is het gedrag identiek aan vandaag (spec-defaults) — alle bestaande flows en tests blijven geldig.
- Migratie 008 is de enige wijziging; `tool_id` is een string (registry-id) — geen FK naar een tool-tabel (registry is code).
- De employee `allowedTools`-lijst (TASK 15) blijft de agent-begrenzing; tenant-policy is de tweede laag (tenant kan méér beperken, nooit méér toestaan dan de agent-definitie).

## 9. Voorgestelde bestanden (implementatie later)

- `apps/web/lib/db/migrations/008_tenant_tool_policies.sql` — §3
- `apps/web/lib/tool-registry/tenant-policy.ts` — §4 (pure resolutie + data-loading)
- `apps/web/lib/tool-registry/registry.ts` — tenant-aware `isEnabled`/`approvalRequired`
- `apps/web/lib/tool-registry/discovery.ts` — tenant-filter actief (TASK 7)
- `apps/web/test/tenant-tool-policies.test.ts` — testmatrix §10

## 10. Testmatrix (FASE 18-aanvulling)

geen rij → spec-default · rij ON → beschikbaar · rij OFF → DENY + uit discovery · rij APPROVAL + MEDIUM → approval vereist · HIGH zonder rij → approval altijd · CRITICAL → tweede ogen · onbekende tenant → DENY · call zonder tenantId → DENY · OFF + approval → OFF wint (geen approval-aanvraag) · policy niet model-muteerbaar (geen write-pad) · cross-tenant rijen geïsoleerd (FK) · employee-flow met rij OFF → tool-call DENY · discovery met rij OFF → uitgesloten · bestaande tests groen (zonder rijen = vandaag).

## 11. Consequenties

- TASK 26 (e2e): per-tenant cases (Tenant A: email_send OFF → DENY; Tenant B: email_send APPROVAL → approval-flow) als e2e-asserties.
- Na TASK 26: de ontwerpfase is compleet — implementatie van registry/adapters/policies kan taak-voor-taak beginnen op basis van deze 25 docs.
