# Agent Tool Platform — Tool Registry Design (TASK 3)

> Datum: 1 september 2026 · Volgt op de capability matrix (TASK 2).
> Uitgangspunt: de bestaande agent-core `ToolRegistry`/`ToolDefinition`/`ToolAdapterRegistry` wordt **uitgebreid, niet vervangen**. Deze taak legt het ontwerp van de centrale tool-metadata vast (FASE 1 van de opdracht); implementatie volgt taak-voor-taak.

---

## 1. Uitgangspunt: bestaande registratie

`packages/agent-core/src/tools/` bevat vandaag (FACT):

```ts
ToolDefinition {
  id, name, category, description,
  capabilities, riskLevel, requiredPermissions,
  inputSchema, outputSchema, enabled
}
ToolRegistry      // register/get/has/list
ToolAdapterRegistry // register/getByTool (adapter per tool)
```

Enforcement zit in de bestaande `ExecutionGate` (policy ALLOW ∧ enabled ∧ adapter ∧ input valid) en `PolicyEngine` (fail-closed). **Dit ontwerp verandert niets aan die enforcement-laag** — het voegt alleen centrale, uitbreidbare metadata toe die de gate/policy voeden.

## 2. ToolSpec — centrale tool-metadata (app-laag)

Nieuw concept in `apps/web/lib/tool-registry/` (voorstel; implementatie in een latere taak):

```ts
type ToolClass = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL_SIDE_EFFECT";

interface ToolSpec {
  // Kern (1:1 met bestaande ToolDefinition)
  id: string;                // bv. "assistant_website_research"
  name: string;
  description: string;
  version: string;           // semver, bv. "1.0.0"
  category: ToolCategory;    // WEB, BROWSER, FILES, CODE, TERMINAL, GITHUB,
                             // DATABASE, CRM, EMAIL, CALENDAR, AI,
                             // OBSERVABILITY, DEPLOYMENT, MCP
  inputSchema: unknown;      // strict JSON-schema (server-side validatie)
  outputSchema: unknown;
  permissions: string[];     // bv. ["API_REQUEST"], ["GITHUB_READ"]
  // Classificatie & risico (uit TASK 2-matrix)
  class: ToolClass;          // READ / WRITE / DESTRUCTIVE / EXTERNAL_SIDE_EFFECT
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requiresApproval: boolean; // afgeleid van risk (HIGH/CRITICAL = true) of tenant-policy
  // Bediening
  enabled: boolean;          // fail-closed default: false
  adapter: string | null;    // id van de ToolAdapter ("http", "github", …); null = NOT_IMPLEMENTED
  // Tenant & audit
  tenantPolicy: "OFF" | "ON" | "APPROVAL" | "TENANT"; // TENANT = per-tenant override (TASK 25)
  auditEnabled: boolean;     // default true; audit/evidence is verplicht voor WRITE+
  // Uitvoering
  timeoutMs: number;         // per-tool harde timeout
  rateLimit: { max: number; windowMs: number } | null;
}
```

**Relatie met ToolDefinition:** een ToolSpec heeft exact dezelfde kernvelden als de agent-core definitie; bij registratie in de app-registry wordt de bijbehorende `ToolDefinition` (indien aanwezig) eruit afgeleid voor de bestaande gate — of de spec *verrijkt* de definitie. Er komt **geen tweede executiepad**: de ExecutionGate blijft de enige poort.

## 3. Registry-API (conceptueel)

```ts
interface ToolRegistryV2 {
  register(spec: ToolSpec): void;              // fail-closed: dubbele id = fout
  get(id: string): ToolSpec | null;
  list(): readonly ToolSpec[];
  isEnabled(id: string, tenantId?: string): boolean;   // tenantPolicy-aware (TASK 25)
  approvalRequired(id: string, tenantId?: string): boolean; // risk- of tenant-bepaald
  resolveAdapter(id: string): string | null;   // naar ToolAdapterRegistry
  toModelTools(ids: string[]): unknown[];      // OpenAI/DeepSeek function-definities (tool discovery)
}
```

- **Fail-closed:** onbekende tool → DENY (gate), disabled → DENY, ontbrekende adapter → NOT_IMPLEMENTED (bestaand gedrag blijft).
- **Approval:** `requiresApproval` is statisch afgeleid (HIGH/CRITICAL = true; WRITE-medium = tenant-policy) en wordt door de approval-engine/employee-flow geconsumeerd — geen model-invloed.
- **Audit:** `auditEnabled` default true; voor WRITE/DESTRUCTIVE/EXTERNAL_SIDE_EFFECT altijd true (FASE 11-verplichting).

## 4. Voorbeelden (concreet, uit de TASK 2-matrix)

```ts
const WEBSITE_RESEARCH: ToolSpec = {
  id: "assistant_website_research",
  name: "Website Research",
  description: "Onderzoek een publieke website (bounded, genormaliseerd, SSRF-beschermd).",
  version: "1.0.0",
  category: "WEB",
  inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  outputSchema: { type: "object" }, // ResearchSummary
  permissions: ["API_REQUEST"],
  class: "READ",
  riskLevel: "MEDIUM",
  requiresApproval: false,
  enabled: true,
  adapter: "http",
  tenantPolicy: "TENANT",
  auditEnabled: true,
  timeoutMs: 30_000,
  rateLimit: { max: 10, windowMs: 60_000 },
};

const EMAIL_SEND: ToolSpec = {
  id: "email_send",
  name: "Email Send",
  description: "Verstuur een goedgekeurde e-mail via de fail-closed dispatcher.",
  version: "1.0.0",
  category: "EMAIL",
  inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["to", "subject"] },
  outputSchema: { type: "object" },
  permissions: ["EMAIL_SEND"],
  class: "EXTERNAL_SIDE_EFFECT",
  riskLevel: "HIGH",
  requiresApproval: true,
  enabled: false,               // alleen na expliciete enablement
  adapter: "email",
  tenantPolicy: "APPROVAL",
  auditEnabled: true,
  timeoutMs: 15_000,
  rateLimit: { max: 20, windowMs: 3_600_000 },
};

const DATABASE_DELETE: ToolSpec = {
  id: "database_delete",
  // class: "DESTRUCTIVE", riskLevel: "CRITICAL", requiresApproval: true (+ tweede ogen),
  // enabled: false, tenantPolicy: "OFF" — nooit automatisch beschikbaar.
};
```

## 5. Integratie met bestaande lagen

| Laag | Rol in het ontwerp | Wijziging |
|---|---|---|
| ToolRegistry (agent-core) | kernregistratie + enabled-check | ongewijzigd; ToolSpec leidt definitie af |
| PolicyEngine | permissions per agent/tool | ongewijzigd (consumeert requiredPermissions uit spec) |
| ExecutionGate | enige executiepoort | ongewijzigd; timeout/rateLimit worden per-spec aangeleverd |
| ApprovalEngine | HIGH/CRITICAL → approval | ongewijzigd; requiresApproval komt uit spec |
| ToolAdapterRegistry | adapter-resolutie | ongewijzigd; spec.adapter verwijst ernaar |
| Tool Discovery (TASK 7) | selecteert relevante tools voor de model-context | nieuw, leest spec (category/keywords) |
| Employee/orchestrators | tool-selectie + budgets | leest spec (class/risk/approval) |

## 6. Backwards compatibility & migratie

- Agent-core `ToolDefinition` en alle bestaande tests blijven **ongewijzigd**.
- De app-registry (`lib/tool-registry/`) is een nieuwe laag; bestaande flows (assistant-tool, runtime-adapter, employee) blijven werken tot ze per taak op de registry worden overgezet.
- **Geen database-migratie** nodig voor deze laag: metadata is code (versieerbaar); per-tenant overrides (tenantPolicy = TENANT/APPROVAL) komen in TASK 25 (database of config).
- Toekomstige MCP/GitHub/browser-adapters registreren zich als ToolSpec + ToolAdapter via dezelfde registry (TASK 8+).

## 7. Voorgestelde bestanden (implementatie later, per taak)

- `apps/web/lib/tool-registry/types.ts` — ToolSpec, ToolClass, categorieën, limieten
- `apps/web/lib/tool-registry/registry.ts` — ToolRegistryV2 (register/get/list/enabled/approval/adapter)
- `apps/web/lib/tool-registry/tools.ts` — de centrale catalogus (begint met website_research/http_get; uitbreiden per tool-taak)
- `apps/web/lib/tool-registry/validation.ts` — schema-validatie + fail-closed-regels
- `apps/web/test/tool-registry.test.ts` — (FASE 18-matrix per tool)
