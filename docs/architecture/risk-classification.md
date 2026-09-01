# Agent Tool Platform — Risk Classification (TASK 5)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op het permission-model (TASK 4).
> Uitgangspunt: de bestaande `RiskLevel` (`LOW/MEDIUM/HIGH/CRITICAL`) in `packages/agent-core/src/permissions/risk.ts` en `requiresHumanApproval(risk)` in `packages/agent-core/src/approvals/types.ts` blijven **ongewijzigd**. Deze taak legt de classificatieregels en de **statische, definitieve risicowaarde per tool** vast (bron: TASK 2-matrix); implementatie volgt taak-voor-taak.

---

## 1. Uitgangspunt: bestaande risk-laag (FACT)

`packages/agent-core` bevat vandaag:

```ts
RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]           // gesloten union
isValidRiskLevel(value)                                       // onbekend → UNKNOWN → DENY
requiresHumanApproval(risk) = risk === "HIGH" || "CRITICAL"   // enige approval-bron
ruleRiskAndApproval: UNKNOWN → DENY; HIGH/CRITICAL zonder geldige APPROVED approval
                      → APPROVAL_REQUIRED / DENY
isApprovalRiskSufficient(approvalRisk, requestRisk)           // approval ≥ request
```

- `request.riskLevel` wordt gevalideerd in de ExecutionGate en de orchestrator (onbekend → DENY, fail-closed).
- Tool-definities dragen al een statisch risico (FACT): `browser` HIGH, `terminal` HIGH, `mcp` HIGH, `filesystem` MEDIUM, `http` MEDIUM.
- **Gap (eerlijk vastgesteld):** `AgentDefinition.riskLevel` is gedeclareerd (MEDIUM/HIGH) maar wordt vandaag **niet** als max-risk-plafond afgedwongen in de policy-evaluatie. Dat wordt een expliciet onderdeel van TASK 6 (approval-integratie).

## 2. Risiconiveaus — definities (consistent met `docs/security/agent-permissions.md`)

| Niveau | Betekenis | Voorbeelden |
|---|---|---|
| `LOW` | Read-only, lokaal, reversibel, geen externe side effects | sitemap_discovery, calendar_read, GitHub reads, deployment_status |
| `MEDIUM` | Externe read, beperkte side effects, of reversibele writes binnen geautoriseerde scope | http_get, website_research, file_read, database_read, CRM read |
| `HIGH` | Externe mutatie, messaging, publiceren, downloads, formulier-interactie | email_send, browser_click, browser_fill, pull_request_merge, calendar_cancel, file_delete, terminal_command |
| `CRITICAL` | Onomkeerbaar, financieel, destructief, credentialed, of gevoelige data | database_delete, secret_management, deployment_production, repo/branch delete |

**Regels:**
1. Risico wordt per **actie** beoordeeld, niet alleen per tool (`docs/security/agent-permissions.md`): één tool kan per capability verschillend risico hebben (browser: `WEB_READ` MEDIUM, `WEB_UPLOAD` CRITICAL).
2. Het risico is **statisch en deterministisch** — vastgelegd in code (ToolSpec/tabel), nooit door een model bepaald.
3. **Bij twijfel: hoogste waarde uit het bereik (fail-closed).**

## 3. Klasse → risico-bereik (koppeling met TASK 4)

| Klasse | Toegestaan bereik | Approval-regel |
|---|---|---|
| READ | LOW–MEDIUM | nooit |
| WRITE | MEDIUM–HIGH | tenant-policy; HIGH → altijd |
| DESTRUCTIVE | HIGH–CRITICAL | altijd (CRITICAL: + tweede ogen) |
| EXTERNAL_SIDE_EFFECT | HIGH–CRITICAL | altijd |

Validatie bij registratie in de registry (TASK 3-ontwerp): `ToolSpec.riskLevel` **moet** binnen het bereik van `ToolSpec.class` liggen — anders registratie-fout (fail-closed bij registratie).

## 4. Definitieve risicotabel per tool (statisch)

Bron: TASK 2-matrix. Waar de matrix een bereik gaf (bv. LOW–MEDIUM), is conform regel 3 de **hoogste** waarde vastgesteld, tenzij de motivatie expliciet anders aangeeft.

| Tool | Klasse | Risk (vast) | Approval | Motivatie |
|---|---|---|---|---|
| http_get | READ | MEDIUM | Nee | externe read; SSRF-gevoelig |
| website_research | READ | MEDIUM | Nee | externe read (bereik LOW–MEDIUM → MEDIUM, conservatief; consistent met TASK 3-spec) |
| web_search | READ | MEDIUM | Nee | externe read via zoekprovider |
| sitemap_discovery | READ | LOW | Nee | publieke metadata, bounded |
| browser_open | READ | MEDIUM | Nee | navigatie naar externe sites |
| browser_extract | READ | MEDIUM | Nee | publieke info, genormaliseerd |
| browser_screenshot | READ | MEDIUM | Nee | publieke info; beelddata |
| browser_click | WRITE | HIGH | **Ja** | formulier/site-interactie = side effect |
| browser_fill | WRITE | HIGH | **Ja** | formulier-invoer = side effect |
| file_read | READ | MEDIUM | Nee | bestandsinhoud; PII-risico |
| file_search | READ | MEDIUM | Nee | idem |
| file_write | WRITE | MEDIUM | Tenant-policy | reversibel binnen root; default uit in productie |
| file_delete | DESTRUCTIVE | HIGH | **Ja** | onomkeerbaar binnen scope |
| code_search / code_analysis | READ | MEDIUM | Nee | repo-inhoud (bereik LOW–MEDIUM → MEDIUM, conservatief) |
| test_runner / formatter / linter | WRITE | MEDIUM | Tenant-policy | lokale artefacten; alleen in sandbox |
| terminal_readonly | READ | MEDIUM | Nee | read-only commando's; nog steeds uitvoering |
| terminal_command | WRITE | HIGH | **Ja** | uitvoering op systeem; sandbox-gebonden |
| repository_read / file_read / issue_read / pull_request_read / workflow_read | READ | LOW | Nee | GitHub read-only, publiek/eigen repo |
| issue_create / pull_request_create / pull_request_review / workflow_rerun | WRITE | MEDIUM | Tenant-policy | zichtbaar in repo maar reversibel; write niet automatisch aan |
| pull_request_merge | EXTERNAL_SIDE_EFFECT | HIGH | **Ja** | wijzigt definitief de branch |
| secret_management / branch_delete / repo_delete | DESTRUCTIVE | CRITICAL | **Ja** (+ tweede ogen) | onomkeerbaar + credential-risico |
| database_read / database_query | READ | MEDIUM | Nee | PII in data |
| database_insert / database_update | WRITE | MEDIUM | Tenant-policy | reversibel binnen eigen tenant (bereik MEDIUM–HIGH → MEDIUM; tenant-policy kan verhogen) |
| database_delete | DESTRUCTIVE | CRITICAL | **Ja** (+ tweede ogen) | onomkeerbaar |
| contact_search / lead_read | READ | MEDIUM | Nee | PII-bewust |
| contact_create / contact_update / lead_create / lead_update | WRITE | MEDIUM | Tenant-policy | eigen tenant-data (bereik MEDIUM–HIGH → MEDIUM) |
| email_search | READ | MEDIUM | Nee | PII in mail |
| email_draft | WRITE | LOW | Nee | **geen verzending, geen extern effect** (lokaal opgeslagen); alleen gekozen LOW omdat er geen side effect is |
| email_send | EXTERNAL_SIDE_EFFECT | HIGH | **Ja** | extern zichtbaar; niet-herroepbaar |
| calendar_read | READ | LOW | Nee | availability/agenda-info |
| calendar_create / calendar_update | WRITE | MEDIUM | Tenant-policy | eigen agenda (bereik MEDIUM–HIGH → MEDIUM) |
| calendar_cancel | WRITE | HIGH | **Ja** | annuleren = impact op afspraak/klant |
| model_call / embedding / classification / summarization | READ | LOW | Nee | geen extern side effect; kosten begrensd via budget (TASK 16) + rateLimit |
| logs_read / metrics_read / traces_read | READ | MEDIUM | Nee | gevoelige run-data; alleen eigen tenant |
| deployment_status | READ | LOW | Nee | status-info |
| deployment_preview | WRITE | MEDIUM | Tenant-policy | preview-omgeving, reversibel |
| deployment_production | EXTERNAL_SIDE_EFFECT | CRITICAL | **Ja** (+ tweede ogen) | productie-impact, onomkeerbaar (bereik HIGH/CRITICAL → CRITICAL, conservatief) |

## 5. Samenvatting per klasse

| Klasse | Aantal tools (vast risico) | Approval-regel |
|---|---|---|
| READ | ~26 | Nee |
| WRITE | ~17 | Tenant-policy; HIGH → altijd |
| DESTRUCTIVE | ~4 | Altijd; CRITICAL + tweede ogen |
| EXTERNAL_SIDE_EFFECT | ~5 | Altijd; CRITICAL + tweede ogen |

## 6. Afleiding & validatie in de ToolSpec (TASK 3-koppeling)

```ts
interface ToolSpec {
  class: "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL_SIDE_EFFECT";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requiresApproval: boolean; // afgeleid: HIGH/CRITICAL → true, of tenant-policy
}
```

Registratie-validatie (fail-closed):
- `riskLevel` ∈ RISK_LEVELS (anders registratie-fout);
- `riskLevel` binnen het bereik van `class` (§3) (anders registratie-fout);
- `requiresApproval` consistent: HIGH/CRITICAL → `true`; MEDIUM → `tenantPolicy` beslist (TASK 6/25).

Deze tabel is de **enige bron** voor `ToolSpec.riskLevel` — één waarheid, geen tweede tabel in code.

## 7. Approval-koppeling (vooruitblik TASK 6)

- `HIGH`/`CRITICAL` → `requiresHumanApproval(risk)` = true → bestaande ApprovalEngine (PENDING → APPROVED/REJECTED/EXPIRED; EXPIRED = DENY).
- `CRITICAL` → **tweede ogen**: twee onafhankelijke menselijke approvals vóór uitvoering (ontwerp; implementatie in TASK 6).
- `MEDIUM` → geen approval standaard; tenant-policy kan `APPROVAL` afdwingen (TASK 25).
- **Design gap (TASK 6):** `AgentDefinition.riskLevel` als max-risk-plafond afdwingen — een agent met `riskLevel: MEDIUM` mag geen HIGH/CRITICAL request doen (vandaag niet gehandhaafd).

## 8. Fail-closed

| Situatie | Beslissing |
|---|---|
| Onbekend risico (`UNKNOWN`) | DENY (bestaand: `ruleInvalidRisk`) |
| Risk buiten klasse-bereik bij registratie | registratie-fout |
| HIGH/CRITICAL zonder geldige approval | APPROVAL_REQUIRED / DENY |
| Approval met onvoldoende risico | DENY (`isApprovalRiskSufficient`) |
| Tool zonder vastgesteld risico | niet registreerbaar |

## 9. Audit / evidence (aansluiting FASE 11)

Elke tool-call legt `riskLevel` vast in de run-records (bestaand gedrag: orchestrator schrijft `record.request.riskLevel`). De audit toont: tool, klasse, risk, approvalId, beslissing. Geen credentials, geen argumentwaarden bij DENY op risk-gronden.

## 10. Backwards compatibility & migratie

- `RISK_LEVELS`, `requiresHumanApproval`, `ruleRiskAndApproval` en alle bestaande tests blijven **ongewijzigd**.
- De tabel is de bron voor toekomstige `ToolSpec.riskLevel`-waarden; bestaande tool-definities (browser HIGH, terminal HIGH, mcp HIGH, filesystem MEDIUM, http MEDIUM) zijn **al consistent** met deze tabel — geen wijziging nodig.
- Geen database-migratie; risico is code (versieerbaar).

## 11. Voorgestelde bestanden (implementatie later, per taak)

- `apps/web/lib/tool-registry/risk.ts` — statische risicotabel per tool + klasse-bereiken (bron van §4/§3)
- `apps/web/lib/tool-registry/validation.ts` — registratie-validatie risk ∈ klasse-bereik
- `apps/web/test/tool-registry-risk.test.ts` — fail-closed tests (onbekend risico, klasse-overschrijding, HIGH→approval, CRITICAL→tweede ogen)
- Agent max-risk-plafond: `packages/agent-core` (TASK 6)

## 12. Consequenties voor TASK 6–7

- TASK 6 (approval-integratie): approval blijft risk-gedreven; CRITICAL + tweede ogen; `AgentDefinition.riskLevel` als max_risk afdwingen.
- TASK 7 (tool-discovery): tools met `requiresApproval` kunnen worden getoond, maar de discovery markeert ze als "approval vereist" — de agent vraagt dan approval vóór uitvoering, nooit daarna.
