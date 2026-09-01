# Agent Tool Platform — Employee Tool Budget (TASK 16)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de employee registry-integratie (TASK 15).
> Doel (FASE 8): elke employee-run krijgt harde, configureerbare budgets — stappen, tool-calls, runtime, netwerkverzoeken. **Budget op = STOP** (gecontroleerd, fail-closed). Deze taak legt het ontwerp vast; implementatie volgt als onderdeel van de registry-integratie (TASK 15-implementatie) en de observability-taak (TASK 24).

---

## 1. Uitgangspunt: bestaande situatie (FACT)

Er bestaat vandaag **geen agent-niveau budget** — geen `maxSteps`/`maxToolCalls`/`maxRuntime` ergens in agent-core of de app-laag. Wat er wél is (per-run / per-tool limieten, losse constanten):

| Limiet | Waarde | Waar |
|---|---|---|
| Tool-rondes website-assistent | `MAX_ASSISTANT_TOOL_ROUNDS = 2` | `apps/web/lib/assistant/tool-loop.ts` |
| Research-pagina's assistent | `ASSISTANT_RESEARCH_MAX_PAGES = 3` | `apps/web/lib/agent-runtime/runtime-adapter.ts` |
| HTTP body/redirects/timeout assistent | 2 MB / 3 / 10 s | idem |
| Website-research (prospect-run) | 512 KB / 3 redirects / 20 000 tekens | `apps/web/lib/prospect-run/website-research.ts` |
| Crawler | `DEFAULT_MAX_URLS = 50`, `DEFAULT_MAX_DEPTH = 1` | `apps/web/lib/seo/crawler.ts` |
| Employee-config | `limit` (kandidaten, tool-cap 10), `freshnessHours` | `apps/web/lib/autonomous-employee/types.ts` |

**Gevolg (FACT):** de employee-run (`orchestrator.ts`, loop over `discovery.value.companies`) is vandaag **ongelimiteerd in stappen, tool-calls, runtime en netwerkverzoeken** — de enige begrenzing is de kandidatenlijst (`limit`, default 5, cap 10 per tool). Een defecte provider-lijst, trage website of model-retry kan de run dus onbeperkt laten doorlopen. FASE 8 sluit dit gat.

## 2. Doel & principe

```text
Elke employee-run:
  EmployeeWorkSessionConfig.budget  (persistente config, JSONB)
    → BudgetTracker (per run, in-memory)
    → check vóór ELKE tool-call (fail-closed)
    → budget op → STOP: geen nieuwe calls, sessie netjes afgesloten met bewijs
```

- Budget is **config, geen model-keuze**: de agent kan zijn eigen budget niet zien, verhogen of omzeilen; de tracker zit in de registry-adapter-laag (TASK 15), vóór de gate.
- Budget-stop is **geen crash**: de lopende call mag afronden, daarna worden geen nieuwe calls meer gestart; de sessie eindigt als `COMPLETED` met `budgetExceeded: true` + usage-snapshot als auditbewijs.
- Budget is **run-scoped**: per `(tenantId, sessionKey)`-sessie, niet globaal — twee tenants kunnen elkaar nooit raken.

## 3. Contract (copy-ready, `apps/web/lib/autonomous-employee/budget.ts`)

```ts
interface EmployeeBudget {
  maxSteps: number;             // aantal verwerkte items/planner-stappen
  maxToolCalls: number;         // ALLE tool-calls incl. DENY'd pogingen (anti-loop)
  maxRuntimeMs: number;         // actieve run-tijd; WAITING_APPROVAL pauzeert de klok
  maxNetworkRequests: number;   // aantal fetch()-invocaties (research + subpagina's)
  maxConcurrentTools: number;   // employee is sequentieel → default 1
  deadline?: string;            // ISO-timestamp; verstreken → zelfde STOP-pad
  maxTokens?: number;           // tenant-budget-hook (TASK 24/25; optioneel)
  maxCost?: number;             // idem
}

interface EmployeeBudgetUsage {
  steps: number;
  toolCalls: number;
  networkRequests: number;
  runtimeMs: number;
  startedAt: string | null;
  finishedAt: string | null;
  exceeded: { field: string; used: number; limit: number } | null;
}
```

**Voorgestelde defaults** (gebaseerd op de huidige schaal: ~20 kandidaten × ~10 calls/company ≈ 200 calls; research = homepage + ≤3 subpagina's ≈ 4 fetches/company):

| Veld | Default | Toelichting |
|---|---|---|
| `maxSteps` | 200 | 20 kandidaten × 10 stappen; operator kan verhogen |
| `maxToolCalls` | 500 | incl. DENY'd pogingen (fail-closed tellen) |
| `maxRuntimeMs` | 2 700 000 (45 min) | actieve tijd; approval-wachttijd telt niet mee |
| `maxNetworkRequests` | 200 | 20 × ~4 fetches + buffer |
| `maxConcurrentTools` | 1 | huidige orchestrator is strikt sequentieel |
| `deadline` | optioneel | harde eindtijd per run |

Defaults zijn een **bewuste gedragswijziging**: een run die vandaag ongelimiteerd is, stopt straks bij de defaults. Dat is precies de bedoeling (FASE 8); operators kunnen per sessie verhogen.

## 4. BudgetTracker — API (conceptueel)

```ts
class EmployeeBudgetTracker {
  constructor(budget: EmployeeBudget, now: () => string)
  check(): { ok: true } | { ok: false; reason: "BUDGET_EXCEEDED"; field: string; used: number; limit: number }
  recordStep(): void
  recordToolCall(toolId: string): void     // vóór de gate-call; DENY telt ook
  recordNetworkRequest(): void             // wrapper rond ctx.fetchImpl
  start(): void                            // eerste tool-call start de klok
  finish(): EmployeeBudgetUsage            // einde run → snapshot voor audit/summary
  snapshot(): EmployeeBudgetUsage          // tussentijds (na elke stap, in session-steps)
}
```

**Telregels (deterministisch, geen LLM-invloed):**
- `recordToolCall` wordt **vóór** de gate aangeroepen: een tool-call die daarna door policy/gate wordt geweigerd telt óók — anders kan een run oneindig DENY-pogingen doen zonder budget te verbruiken.
- `recordNetworkRequest` telt elke `fetch()`-invocatie (injecteerbare counter-wrapper om `ctx.fetchImpl`, zoals de bestaande `lookup`-injectie); redirects binnen één fetch tellen niet extra (die zijn per-fetch al bounded door `maxRedirects`).
- `recordStep` per verwerkte company/planner-stap in de orchestrator-loop.
- `maxRuntimeMs` meet **actieve** tijd: de klok loopt van eerste tot laatste tool-call; de `WAITING_APPROVAL`-periode (menselijke goedkeuring kan uren openstaan) pauzeert de klok — anders forceert een trage goedkeuring een valse budget-stop.
- `deadline` (indien gezet) is een harde bovengrens: `now() >= deadline` → zelfde STOP-pad, onafhankelijk van de klok.

## 5. Enforcement-punten (implementatie later, in de TASK 15-files)

| Punt | Waar | Gedrag |
|---|---|---|
| Vóór elke tool-call | `registry-adapter.ts` (TASK 15) | `tracker.check()`; `BUDGET_EXCEEDED` → call geweigerd vóór de gate (geen execute, geen adapter) |
| Per stap | `orchestrator.ts` loop | `recordStep()` na elke company; bij budget-stop: lus afbreken |
| Netwerk | research-adapter | counter-wrapper rond `ctx.fetchImpl` (zoals `lookup` vandaag injecteerbaar is) |
| Klok | tracker | `start()` bij eerste call; `finish()` in `finally`-pad van `startWorkSession` |
| Persistente config | `types.ts` | `budget?: EmployeeBudget` op `EmployeeWorkSessionConfig` (JSONB, **geen migratie**) |
| Bewijs | `orchestrator.ts` | bij stop: `appendWorkSessionStep(..., "budget_exceeded", "error", { field, used, limit })` + summary `budgetExceeded: true` + `usage`-snapshot |

## 6. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| `maxToolCalls` bereikt | volgende call geweigerd (`BUDGET_EXCEEDED`), sessie → `COMPLETED` + `budgetExceeded` |
| `maxSteps` bereikt | loop stopt vóór de volgende company |
| `maxRuntimeMs` bereikt | klok-check vóór elke call → zelfde STOP-pad |
| `maxNetworkRequests` bereikt | research-call geweigerd; geen fetch meer |
| `deadline` verstreken | STOP, onafhankelijk van andere counters |
| Budget ontbreekt in config | defaults §3 (fail-closed: nooit ongelimiteerd) |
| Ongeldig budget (negatief/NaN) | validatie weigert sessiestart (`INVALID_BUDGET`) — geen stilzwijgend herstel |
| Call in uitvoering bij budget-stop | mag afronden; daarna géén nieuwe calls (geen midden-in-executie afbreken) |
| Approval open (WAITING_APPROVAL) | telt niet mee voor runtime-klok; sessie blijft wachten |

## 7. Security

- Budget is fail-closed en **model-onaantastbaar**: geen enkele tool kan `budget` muteren (config komt van de operator/trigger, niet uit een tool-resultaat).
- DENY'd calls verbruiken budget → een run kan niet oneindig blijven proberen.
- Usage-snapshot bevat alleen tellers + veldnamen — **nooit** argumentwaarden, URL's of credentials (FASE 11).
- Tenant-isolatie: tracker is per sessie (per tenant), geen gedeelde counters.
- Budget-stop wordt als stap + summary vastgelegd → traceerbaar (FASE 12: `agent_budget_exceeded_total` in TASK 24).

## 8. Backwards compatibility & migratie

- Geen database-migratie: `budget` zit in de bestaande `config` JSONB-kolom van `employee_work_sessions` (005); `summary` krijgt `budgetExceeded` + `usage` (bestaande JSONB).
- Bestaande employee-tests blijven groen: de tracker is een optionele injecteerbare dependency (`deps.budget`); zonder tracker-constructie verandert er niets. Nieuwe tests dekken de tracker zelf.
- Gedragswijziging (bewust): runs zonder expliciet budget krijgen de defaults §3 — documenteren in de changelog van de implementatiecommit.
- `MAX_ASSISTANT_TOOL_ROUNDS` / `ASSISTANT_RESEARCH_MAX_PAGES` blijven ongewijzigd (assistant is een aparte agent; TASK 15-integratie raakt ze niet).

## 9. Voorgestelde bestanden (implementatie later)

- `apps/web/lib/autonomous-employee/budget.ts` — `EmployeeBudget`, `EmployeeBudgetTracker`, `EmployeeBudgetUsage`, defaults
- `apps/web/lib/autonomous-employee/types.ts` — `budget?: EmployeeBudget` op config; `budgetExceeded`/`usage` op summary
- `apps/web/lib/autonomous-employee/registry-adapter.ts` — `check()` vóór gate + netwerk-counter (TASK 15-file)
- `apps/web/lib/autonomous-employee/orchestrator.ts` — `recordStep`, `start`/`finish`, STOP-pad
- `apps/web/test/employee-budget.test.ts` — testmatrix §10

## 10. Testmatrix (FASE 18)

maxToolCalls bereikt → call geweigerd vóór gate · maxSteps bereikt → loop stopt · maxRuntimeMs bereikt → STOP (injecteerbare `now`) · maxNetworkRequests bereikt → research geweigerd · deadline verstreken → STOP · DENY'd calls tellen mee (anti-loop) · budget ontbreekt → defaults · ongeldig budget → `INVALID_BUDGET` · call in uitvoering mag afronden · approval-wachttijd telt niet mee voor klok · usage-snapshot zonder secrets · budgetExceeded vastgelegd in steps + summary · determinisme (zelfde input → zelfde counters) · concurrente sessies delen geen counters · bestaande employee-tests blijven groen (tracker optioneel).

## 11. Consequenties

- TASK 17 (approval-integratie): approval-wachttijd valt buiten de runtime-klok (afspraak §4) — de approval-engine koppelt `approvalId` aan de call, de tracker telt alleen actieve tijd.
- TASK 24 (observability): `agent_budget_exceeded_total` + `agent_steps_total`/`agent_tokens` uit het usage-snapshot.
- TASK 26 (e2e): budget-stop als expliciete e2e-case.
