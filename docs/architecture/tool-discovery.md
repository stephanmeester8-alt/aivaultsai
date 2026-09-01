# Agent Tool Platform — Tool Discovery Design (TASK 7)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de approval-integratie (TASK 6).
> Uitgangspunt: vandaag krijgt de website-assistent een **statische** tool-set (`ASSISTANT_TOOLS`, alleen `assistant_website_research`). Deze taak legt het ontwerp vast van een centrale Tool Discovery die per intent + agent + tenant alleen de **relevante, haalbare** tools in de model-context plaatst (FASE 16). Implementatie volgt later; agent-core blijft ongewijzigd.

---

## 1. Uitgangspunt: bestaande situatie (FACT)

```ts
// apps/web/lib/assistant/tool-loop.ts
ASSISTANT_TOOLS = [assistant_website_research]   // statisch, handmatig onderhouden
// max 2 tool-rondes; elke call via runtime-adapter → PolicyEngine → ExecutionGate
```

- De tool-set groeit (GitHub, browser, email, CRM, calendar, MCP …) → een statische lijst wordt onhoudbaar en vervuilt de model-context.
- `AgentDefinition` heeft al `allowedTools` / `allowedPermissions` (agent-core); `ToolSpec` (TASK 3-ontwerp) heeft category/description/permissions/riskLevel/requiresApproval/enabled/adapter.
- De ExecutionGate blijft de **enige** executiepoort; discovery verandert daar niets aan.

## 2. Doel & principe

Discovery beantwoordt: *"welke tools mag deze agent voor deze intent zien?"*

```text
AGENT (intent: "Ik wil websites onderzoeken")
  → DISCOVERY (registry + filters + ranking)
  → web_search, website_research, sitemap_discovery, http_get   (≤ maxTools)
  → toModelTools() → OpenAI/DeepSeek function-definities
```

Effecten (FASE 16): lagere token usage, minder model confusion, lagere latency, minder tool-hallucinatie.

**Discovery is GEEN autorisatie.** Een tool in de context betekent niet dat hij mag draaien: elke call gaat alsnog door registry → input-validatie → policy → approval → gate. Discovery toont alleen wat de agent **zou mogen proberen** — de gate beslist definitief.

**Discovery is GEEN LLM-beslissing.** Selectie is een deterministische pure functie over registry-metadata (geen model-call, geen I/O): het model kan zijn eigen tool-set niet kiezen of uitbreiden.

## 3. Pipeline (conceptueel)

```text
1. INTENT-NORMALISATIE   lowercase, token-split, stopwoorden
2. SCORING               keywords-match (zwaarst) + category-match + description-overlap
3. FILTERS (fail-closed) enabled · adapter aanwezig · agent allowedTools · permissions
                         · tenant-policy (TASK 25-hook) · max_risk (agent, TASK 6)
4. RANKING               score desc · risk asc (READ vóór WRITE bij gelijke score) · id (stabiel)
5. LIMIET                maxTools (default 8) · per-categorie cap
6. OUTPUT                ToolSpec[] + flags → toModelTools(ids)
```

## 4. API-ontwerp

```ts
interface ToolDiscoveryInput {
  intent: string;            // natuurlijke taal, bv. "Ik wil websites onderzoeken"
  agentId: string;           // principal
  tenantId?: string;         // TASK 25-hook
  limit?: number;            // default 8, max 16
  categories?: ToolCategory[]; // optionele scope-beperking
}

interface DiscoveryResult {
  tools: readonly ToolSpec[];       // gesorteerd, gefilterd
  intent: string;
  matchedCategories: readonly ToolCategory[];
  truncated: boolean;               // limit overschreden?
}

discoverTools(input, registry, agents, tenantPolicy?): DiscoveryResult  // pure functie
toModelTools(specs): AssistantToolDefinition[]                          // OpenAI/DeepSeek shape
```

## 5. Matching & scoring (deterministisch)

Per ToolSpec (nieuw metadata-veld `keywords: string[]` in de ToolSpec-catalogus, TASK 3-uitbreiding):

| Bron | Gewicht |
|---|---|
| keyword-exact-match met intent-token | 3 |
| category-naam match (bv. "github" ↔ GITHUB) | 2 |
| description-token-overlap | 1 |

- Score < drempel (bv. 1) → niet teruggeven.
- Tiebreak: `riskLevel` oplopend (READ/laag-risico eerst), daarna `id` (stabiele volgorde — determinisme).
- Geen match → lege set + `matchedCategories: []` (fail-closed, geen "gok-tools").

## 6. Filters (fail-closed)

| Filter | Regel |
|---|---|
| enabled | `enabled === false` → uit |
| adapter | `adapter === null` → uit (NOT_IMPLEMENTED-tools worden niet aangeboden) |
| agent.allowedTools | tool niet in `allowedTools` → uit |
| permissions | `agent.allowedPermissions ∩ tool.permissions === ∅` → uit |
| max_risk (TASK 6) | `RISK_RANK[tool.riskLevel] > RISK_RANK[agent.riskLevel]` → uit |
| tenant-policy (TASK 25) | `tenantPolicy === OFF` voor deze tenant → uit |

**Approval-markering (TASK 6-koppeling):** tools met `requiresApproval: true` (of tenant-`APPROVAL`) worden **wel** getoond, met vlag `requiresApproval: true` + `riskLevel` — de agent kan de actie aanvragen, maar uitvoering wacht op de approval-flow (PENDING → human → APPROVED). De discovery markeert dus, verbergt niet.

## 7. Voorbeelden

| Intent | Geretourneerd (na filters) | Uitgesloten |
|---|---|---|
| "Ik wil websites onderzoeken" | web_search, website_research, sitemap_discovery, http_get | GitHub, Stripe, email, calendar, database, Kubernetes |
| "GitHub issues bekijken" | issue_read, repository_read | email_send, database_delete, browser_fill |
| "Een e-mail versturen" | email_draft, email_send (vlag: approval) | calendar, CRM |
| "Kosten/budget" (onbekend) | lege set | — (fail-closed) |

## 8. Fail-closed tabel

| Situatie | Discovery-uitkomst |
|---|---|
| Onbekende intent / geen match | lege set (geen gok-tools) |
| Intent vraagt alleen write-tools | alleen met `requiresApproval`-vlag; zonder permission → leeg |
| Agent zonder permissions | lege set |
| Disabled tool / geen adapter | nooit aangeboden |
| limit overschreden | `truncated: true` + hoogst-gescoorde subset |
| Tenant-policy OFF | uitgesloten (TASK 25) |

## 9. Discovery ≠ autorisatie (security)

- Discovery-output wordt nooit als autorisatiebewijs gebruikt; de gate doet alle checks opnieuw per call.
- Geen secrets/credentials in ToolSpec-descriptions; discovery-log bevat intent + tool-ids + timestamp, nooit argumentwaarden.
- Prompt-injectie: intent is onvertrouwde invoer → alleen token-matching op vaste metadata; een intent kan nooit tools "openen" die de filters zouden blokkeren.

## 10. Performance & cache

- `discoverTools` is een pure functie zonder I/O → memoiseerbaar per `(intentHash, agentId, tenantId)`; registry-wijzigingen invalideren de cache.
- `toModelTools` is statisch per ToolSpec (schema's zijn code) → geen runtime-kosten per call.

## 11. Backwards compatibility & migratie

- `ASSISTANT_TOOLS` (tool-loop) blijft werken als fallback; zodra discovery geïmplementeerd is, wordt de tool-loop erop overgezet (de huidige enige tool `assistant_website_research` komt 1:1 uit de registry).
- Agent-core en alle 239 agent-core tests blijven ongewijzigd; nieuwe code is app-laag (`apps/web/lib/tool-registry/`).
- Employee (TASK 15) en MCP-tools (TASK 8) gebruiken dezelfde discovery — één selectiepad voor alle agents.

## 12. Voorgestelde bestanden (implementatie later)

- `apps/web/lib/tool-registry/discovery.ts` — discoverTools + toModelTools
- `apps/web/lib/tool-registry/tools.ts` — `keywords` per ToolSpec (uitbreiding TASK 3-catalogus)
- `apps/web/test/tool-registry-discovery.test.ts` — testmatrix §13

## 13. Testmatrix (FASE 18)

relevante match · irrelevante tools uitgesloten · disabled tools uitgesloten · geen-permission tools uitgesloten · adapter-missing uitgesloten · max_risk uitgesloten (TASK 6) · approval-vlag aanwezig · limit + truncated · onbekende intent → leeg · write-intent → alleen met approval-vlag · determinisme (zelfde input =zelfde output) · geen secrets in output · tenant-OFF uitgesloten (TASK 25-hook).

## 14. Consequenties voor volgende taken

- TASK 8 (MCP-architectuur): MCP-tools registreren in dezelfde registry → automatisch vindbaar via discovery.
- TASK 15 (employee registry-integratie): employee gebruikt discovery i.p.v. eigen statische selectie.
- TASK 16 (budgets): discovery-output binnen budget-limieten (maxTools per run).
- TASK 24 (observability): metrics `tool_discovery_calls_total`, `tools_per_discovery`.
