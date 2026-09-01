# Agent Tool Platform — Tool Permission Model (TASK 4)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op het registry-design (TASK 3).
> Uitgangspunt: het bestaande permission-systeem in `packages/agent-core/src/permissions/` wordt **uitgebreid, niet vervangen**. Deze taak legt het ontwerp van het centrale permission-model vast (FASE 1 + de permissions-rij van de TASK 2-matrix); implementatie volgt taak-voor-taak.

---

## 1. Uitgangspunt: bestaande permission-laag (FACT)

`packages/agent-core/src/permissions/` bevat vandaag:

```ts
PERMISSIONS = [
  "WEB_SEARCH", "WEB_READ", "WEB_NAVIGATE", "WEB_CLICK", "WEB_TYPE",
  "WEB_DOWNLOAD", "WEB_UPLOAD",
  "FILESYSTEM_READ", "FILESYSTEM_WRITE",
  "TERMINAL_EXECUTE",
  "API_REQUEST",
  "MCP_EXECUTE",
] // gesloten union; isValidPermission → unknown = DENY

AgentDefinition { allowedPermissions, prohibitedPermissions, allowedTools, prohibitedTools, capabilities }

checkAgentPermission(agent, permission)
  → prohibited → DENY | allowed → ALLOW | anders → DENY

rulePermissions(context, agent, tool)  // in PolicyEngine-evaluatie
  → tool.requiredPermissions leeg+requested leeg → fout
  → requested leeg terwijl tool permissions vereist → DENY
  → onbekende permission → DENY
  → permission niet toepasbaar op tool → DENY
  → permission niet toegestaan voor agent → DENY
```

Enforcement zit in de bestaande `PolicyEngine` (fail-closed) en `ExecutionGate` (enige executiepoort). **Dit ontwerp verandert niets aan de evaluatievolgorde of aan de gate** — het breidt de permission-catalogus uit, definieert de relatie permission ↔ klasse ↔ risk ↔ approval, en voegt de tenant-dimensie conceptueel toe (implementatie in TASK 25).

## 2. Kernconcepten

| Concept | Definitie | Wie beslist |
|---|---|---|
| **Permission** | Statische capability-naam (`<DOMAIN>_<ACTION>`), gesloten union | code (registry/catalogus) |
| **PermissionDecision** | `{ allowed, permission, reason }` per enkele grant-check | `checkAgentPermission` |
| **requiredPermissions** | Contract per tool: welke permissions een tool-call minimaal moet opgeven | ToolSpec / ToolDefinition |
| **Klasse** | `READ / WRITE / DESTRUCTIVE / EXTERNAL_SIDE_EFFECT` (effect van de actie) | ToolSpec.class |
| **RiskLevel** | `LOW / MEDIUM / HIGH / CRITICAL` (gevolg van een fout) | ToolSpec.riskLevel |
| **Approval** | Menselijke autorisatie vooraf (alleen HIGH/CRITICAL) | ApprovalEngine |

**Vaste relaties (uit de TASK 2-matrix):**

- permission ≠ risk: één permission kan in meerdere tools met verschillend risk voorkomen (`FILESYSTEM_WRITE`: file_write MEDIUM, file_delete HIGH).
- permission ≠ approval: approval volgt uit risk/tenant-policy, niet uit de permission-naam.
- permission ≠ tool: een tool vereist ≥ 1 permission; een permission kan door meerdere tools worden gebruikt (`API_REQUEST` → http_get én website_research).
- permission ≠ capability: capability is een eigenschap van de agent (rol), permission is een eigenschap van de aanvraag. Beide moeten passen.

## 3. Permission-catalogus (uitbreiding van PERMISSIONS)

Naamgevingsconventie: `DOMAIN_ACTION`, gesloten union, fail-closed (`isValidPermission`).

| Permission | Klasse (dominant gebruik) | Risk-bereik | Huidige tools | Status |
|---|---|---|---|---|
| `API_REQUEST` | READ | LOW–MEDIUM | http_get, website_research, sitemap_discovery | **bestaat** |
| `WEB_SEARCH` | READ | MEDIUM | web_search | **bestaat** |
| `WEB_READ` | READ | MEDIUM | browser_extract, browser_screenshot | **bestaat** |
| `WEB_NAVIGATE` | READ | MEDIUM | browser_open | **bestaat** |
| `WEB_CLICK` | WRITE | HIGH | browser_click | **bestaat** |
| `WEB_TYPE` | WRITE | HIGH | browser_fill | **bestaat** |
| `WEB_DOWNLOAD` | READ | MEDIUM | browser download (later) | **bestaat** |
| `WEB_UPLOAD` | WRITE | HIGH–CRITICAL | browser upload (later) | **bestaat** |
| `FILESYSTEM_READ` | READ | MEDIUM | file_read, file_search, code_search | **bestaat** |
| `FILESYSTEM_WRITE` | WRITE | MEDIUM–HIGH | file_write, file_delete | **bestaat** |
| `TERMINAL_EXECUTE` | WRITE | MEDIUM–HIGH | test_runner, formatter, linter, terminal_* | **bestaat** |
| `MCP_EXECUTE` | WRITE | MEDIUM–CRITICAL | mcp-tools (TASK 8+) | **bestaat** |
| `GITHUB_READ` | READ | LOW | repository/file/issue/PR/workflow read | **nieuw (TASK 9)** |
| `GITHUB_WRITE` | WRITE | MEDIUM | issue_create, PR_create, workflow_rerun | **nieuw** |
| `GITHUB_ADMIN` | DESTRUCTIVE | CRITICAL | merge, branch_delete, secret_management | **nieuw** |
| `DATABASE_READ` | READ | MEDIUM | database_read, database_query | **nieuw** |
| `DATABASE_WRITE` | WRITE | MEDIUM–CRITICAL | insert/update/delete | **nieuw** |
| `CRM_READ` | READ | MEDIUM | contact_search, lead_read | **nieuw** |
| `CRM_WRITE` | WRITE | MEDIUM–HIGH | contact/lead create/update | **nieuw** |
| `EMAIL_READ` | READ | MEDIUM | email_search | **nieuw** |
| `EMAIL_DRAFT` | WRITE | LOW–MEDIUM | email_draft | **nieuw** |
| `EMAIL_SEND` | EXTERNAL_SIDE_EFFECT | HIGH | email_send | **nieuw** |
| `CALENDAR_READ` | READ | LOW | calendar_read | **nieuw** |
| `CALENDAR_WRITE` | WRITE | MEDIUM–HIGH | create/update/cancel | **nieuw** |
| `MODEL_CALL` | READ | LOW–MEDIUM | model_call, embedding, classification, summarization | **nieuw** |
| `OBSERVABILITY_READ` | READ | MEDIUM | logs/metrics/traces_read | **nieuw** |
| `DEPLOYMENT_READ` | READ | LOW | deployment_status | **nieuw** |
| `DEPLOYMENT_WRITE` | EXTERNAL_SIDE_EFFECT | MEDIUM–CRITICAL | preview, production | **nieuw** |
| `NOTIFICATION_SEND` | EXTERNAL_SIDE_EFFECT | HIGH | notifications (later) | **nieuw** |

Toevoegen aan `PERMISSIONS` is **backwards compatible**: bestaande agents die de nieuwe permissions niet in `allowedPermissions` hebben, krijgen automatisch DENY (fail-closed blijft). Bestaande tests blijven geldig.

## 4. Evaluatievolgorde (fail-closed, ongewijzigd ten opzichte van vandaag)

Elke tool-call doorloopt in deze vaste volgorde; **elke stap kan DENY geven vóórdat de volgende stap draait**:

```text
1. Agent bestaat en is ACTIVE                  → anders DENY
2. Tool bestaat                                → anders DENY
3. Tool is enabled                             → anders DENY
4. Tool in allowedTools, niet in prohibited    → anders DENY
5. Agent heeft vereiste capability             → anders DENY
6. Requested permissions bekend                → anders DENY
7. Permissions toepasbaar op tool              → anders DENY
8. Agent mag elke permission (grant-check)     → anders DENY
9. Risk LOW/MEDIUM → ALLOW; HIGH/CRITICAL → approval vereist (stap 10)
10. Geldige APPROVED approval → ALLOW; anders APPROVAL_REQUIRED / DENY
```

**Belangrijk (bestaand gedrag):** permission-fouten (stap 6–8) worden **vóór** approval afgehandeld — een agent kan nooit een menselijke approval vragen voor iets wat hij qua permission nooit mag.

## 5. Grant-model per principal

Een permission-grant is een tuple (uitbreiding van `docs/security/agent-permissions.md`):

| Veld | Betekenis |
|---|---|
| `principal` | wie vraagt: `agentId` (vandaag) of `tenantId` (TASK 25) |
| `permission` | welke permission |
| `effect` | `ALLOW` / `DENY` (vandaag) · `APPROVAL` (tenant, TASK 25) |
| `scope` | optionele resource-beperking (domein, repo, tabel) — later |

Resolutie per permission (fail-closed):

```text
prohibitedPermissions (agent)  → DENY          (hoogste prioriteit)
allowedPermissions (agent)     → ALLOW
geen vermelding                → DENY          (default deny)
```

Tenant (conceptueel, implementatie TASK 25): `tenantPolicy` uit de ToolSpec werkt op tool-niveau (`OFF/ON/APPROVAL`); op permission-niveau komt daar `TenantPermissionBinding { tenantId, permission, effect }` bij. Evaluatie per tool-call wordt dan:

```text
tenant binding permission = OFF         → DENY
tenant binding permission = APPROVAL    → approval vereist (na agent-grant-check)
agent-grant-check (bovenstaand)         → ALLOW | DENY
```

## 6. Per-klasse regels (uit de TASK 2-matrix)

| Klasse | Approval-regel | Permission-voorbeelden |
|---|---|---|
| READ | nooit (LOW/MEDIUM) | API_REQUEST, GITHUB_READ, DATABASE_READ, CRM_READ, EMAIL_READ, CALENDAR_READ, MODEL_CALL, OBSERVABILITY_READ, DEPLOYMENT_READ |
| WRITE | tenant-policy; HIGH → altijd | GITHUB_WRITE, DATABASE_WRITE, CRM_WRITE, CALENDAR_WRITE, EMAIL_DRAFT, WEB_CLICK, WEB_TYPE, FILESYSTEM_WRITE (per tool risk) |
| DESTRUCTIVE | altijd (CRITICAL: + tweede ogen) | GITHUB_ADMIN, DATABASE_WRITE (delete), FILESYSTEM_WRITE (delete) |
| EXTERNAL_SIDE_EFFECT | altijd | EMAIL_SEND, DEPLOYMENT_WRITE, NOTIFICATION_SEND |

De `requiresHumanApproval(risk)`-functie in de gate blijft de enige approval-bron; de klasse bepaalt het risk-bereik, niet de approval zelf.

## 7. ToolSpec ↔ permission (koppeling met TASK 3)

De `ToolSpec.permissions: string[]` uit het registry-design wordt gevalideerd tegen deze catalogus:

- elke entry moet bestaan in `PERMISSIONS` (uitbreiding) — anders registratie-fout (fail-closed bij registratie);
- `ToolSpec.permissions` moet **exact** de `requiredPermissions` van de bijbehorende `ToolDefinition` afleiden — geen tweede waarheid;
- `class` en `riskLevel` van de spec moeten consistent zijn met de klasse-tabel (§6) — validatie bij registratie.

Voorbeeld-koppeling (concreet):

```ts
// TASK 3-spec → TASK 4-permissions
WEBSITE_RESEARCH: { class: "READ", risk: "MEDIUM", permissions: ["API_REQUEST"] }
EMAIL_SEND:       { class: "EXTERNAL_SIDE_EFFECT", risk: "HIGH", permissions: ["EMAIL_SEND"] }
GITHUB_READ:      { class: "READ", risk: "LOW",     permissions: ["GITHUB_READ"] }
DATABASE_DELETE:  { class: "DESTRUCTIVE", risk: "CRITICAL", permissions: ["DATABASE_WRITE"] }
```

## 8. Regels voor agents (model mag nooit beslissen)

- Het model **vraagt** permissions aan (`requestedPermissions`); de runtime **beslist**.
- `allowedPermissions`/`prohibitedPermissions` staan statisch in de `AgentDefinition` (code), nooit in een prompt.
- Een agent kan zichzelf geen permission geven: geen enkel request kan `allowedPermissions` muteren.
- Permission-fouten verschijnen in het `PolicyResult` (`missingPermissions`, `reason`) en in audit — maar nooit met credentials.

## 9. Audit / evidence (aansluiting op FASE 11)

Elke permission-beslissing is onderdeel van het policy-resultaat en wordt vastgelegd in de bestaande run-records:

- `ALLOW`: toolId + permissions + risk + approvalId (indien van toepassing)
- `DENY`: toolId + reden (bv. `missingPermissions: ["GITHUB_READ"]`) + permissions
- `APPROVAL_REQUIRED`: risk + reden

**Nooit** in logs/evidence: API-keys, tokens, wachtwoorden, cookies, authorization-headers.

## 10. Backwards compatibility & migratie

- `PERMISSIONS` uitbreiden is non-breaking: onbekende permission → DENY (bestaand gedrag), bestaande agents krijgen nieuwe permissions niet automatisch.
- `AgentDefinition`-structuur en `checkAgentPermission`/`rulePermissions` blijven ongewijzigd.
- Alle bestaande agent-core tests (239) blijven geldig; nieuwe permissions krijgen eigen fail-closed-tests bij de implementatietaak.
- Tenant-bindings raken geen bestaande code: ze komen in TASK 25 als nieuwe laag (config/database) bovenop de bestaande engine.

## 11. Voorgestelde bestanden (implementatie later, per taak)

- `packages/agent-core/src/permissions/types.ts` — uitbreiding van `PERMISSIONS` (§3)
- `packages/agent-core/test/permissions/permissions.test.ts` — fail-closed tests per nieuwe permission
- `apps/web/lib/tool-registry/permissions.ts` — ToolSpec.permissions ↔ ToolDefinition.requiredPermissions afleiding + validatie (§7)
- Tenant-bindings: TASK 25 (`lib/tenant-policies/` + migratie)

## 12. Consequenties voor TASK 5–7

- TASK 5 (risk-classificatie): klasse-tabel §6 is de bron; risk statisch per tool, geen model-invloed.
- TASK 6 (approval-integratie): approval blijft risk-gedreven via bestaande gate; WRITE-medium → tenant-policy.
- TASK 7 (tool-discovery): discovery selecteert alleen tools waarvoor de agent daadwerkelijk permissions heeft — geen tools tonen die toch DENY krijgen.
