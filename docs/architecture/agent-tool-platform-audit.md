# Agent Tool Platform — Repository & Architecture Audit (TASK 1)

> Datum: 1 september 2026 · Branch: `release/attribution` · HEAD: `7d9dc7e` (in sync met origin)
> Status: audit-only, geen code gewijzigd.

---

## 1. Repository & huidige staat

| Onderdeel | Status |
|---|---|
| Branch | `release/attribution` = `origin/release/attribution` = `7d9dc7e`, working tree clean |
| App | `apps/web` — Next.js 16.3.1 (Turbopack), app router, Node runtime |
| Agent core | `packages/agent-core` — framework-vrij, in-memory engines, 239 tests |
| Migraties | 001 customer-zero · 002 agent-runtime · 003 prospect-run · 004 discovery · 005 employee work sessions |
| Tests | Web **300/300** · Agent-core **239/239** · Lint 0 · Build groen |

## 2. Bestaande agent-keten (volledig operationeel)

```
MODEL (OpenAI Responses API, gpt-5.6-luna)
  ↓ tool-call
/ api/assistant → runAssistantToolLoop (max 2 rondes)
  ↓ executeAssistantToolCall
AgentRuntimeCore (buildAssistantToolCore)
  → TaskEngine (createTask)
  → ExecutionGate (policy ALLOW ∧ enabled ∧ adapter ∧ input valid)
  → PolicyEngine (fail-closed; permissions via agent-definities)
  → HttpAdapter (SSRF-guarded, bounded 2 MB, truncated)
  → EvidenceStore + RunRecorder (audit)
  → ResearchSummary (compact, genormaliseerd — ruwe HTML gaat nooit naar het model)
  ↓
tool-resultaat → tweede model-call → antwoord
```

Daarnaast: Customer Zero (funnel), Prospect Run/Discovery, Autonomous Employee (work sessions, approval-gate via admin-API).

## 3. Capability audit (FASE 0) — Tool-matrix

Legenda status: **I** = implemented/operational · **I-P** = partial · **D** = designed (definitie bestaat) · **M** = missing · **N/A** = niet van toepassing.
Classificatie: READ / WRITE / DESTRUCTIVE / EXTERNAL_SIDE_EFFECT.

| # | Tool/capability | Status | Adapter | Permissions | Risk | Approval | Used by | Tests | Production ready |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **HTTP (http_get)** | I | `HttpAdapter` (agent-core, read-only GET, SSRF, bounded 2 MB/10 s/3 redirects, truncated) | `API_REQUEST` | MEDIUM | Nee (alleen HIGH/CRITICAL) | assistant_website_research, post-lead runtime-taak (sitemap) | agent-core adapters + bridge-tests | **Ja** |
| 2 | **Website Research** | I | combinatie HttpAdapter + `research-summary.ts` + `ai-detection.ts` | `API_REQUEST` | LOW–MEDIUM | Nee | `assistant_website_research` | 15 research-tests | **Ja** |
| 3 | **Filesystem** | I-P | `FilesystemAdapter` (root-scoped, read; write opt-in) | `FILESYSTEM_READ/WRITE` | MEDIUM | Nee | geen (alleen agent-core-suite) | agent-core | Nee — niet enabled in productie |
| 4 | **Terminal** | D | — (geen adapter) | `TERMINAL_EXECUTE` | HIGH | Ja (HIGH) | geen | policy-tests | Nee — NOT_IMPLEMENTED |
| 5 | **Browser** | D | — (geen adapter; BROWSER_TOOL disabled) | `WEB_*` | HIGH | Ja | geen | — | Nee |
| 6 | **Search (web_search)** | M | — | — | — | — | — | — | Nee |
| 7 | **GitHub** | M | — | — | — | — | — | — | Nee |
| 8 | **MCP** | D | — (MCP_TOOL disabled, geen adapter) | `MCP_EXECUTE` | HIGH | Ja | geen | — | Nee |
| 9 | **Database (als tool)** | M | applicatie-repositories bestaan (prospect/lead/runtime), géén model-tool | — | — | — | — | — | Nee |
| 10 | **Email (send)** | I-P | `email-dispatcher.ts` (fail-closed; HUMAN_REVIEW default; AUTO_SEND vereist provider + alle gates) | n.v.t. (app-laag) | HIGH | **Ja** (employee approveAction) | Prospect Run, Employee | prospect-run + employee tests | Nee — geen provider geconfigureerd |
| 11 | **Calendar** | I-P | booking service + `UnavailableCalendarProvider` (geen fake-slots) | n.v.t. | MEDIUM | Nee | website-flow (alleen availability) | booking-unavailable | Nee — geen echte provider |
| 12 | **CRM** | M | — (lead-tabellen bestaan; geen model-tool) | — | — | — | — | — | Nee |
| 13 | **Notifications** | M | — | — | — | — | — | — | Nee |
| 14 | **Storage** | M | — | — | — | — | — | — | Nee |
| 15 | **Stripe/Billing** | M | — | — | — | — | — | — | Nee |
| 16 | **Cloud** | M | — | — | — | — | — | — | Nee |
| 17 | **Docker** | M | — | — | — | — | — | — | Nee |
| 18 | **Kubernetes** | M | — | — | — | — | — | — | Nee |
| 19 | **Observability** | I-P | recorder (run/execution/evidence-tabellen) + structured logs; géén metrics | n.v.t. | n.v.t. | Nee | runtime/adapter/employee | runtime-recorder | Partial — metrics ontbreken |
| 20 | **AI/model tools** | I-P | `openai-analyzer.ts` (Responses API, strict JSON, fail-safe) — als code, niet als registry-tool | n.v.t. | n.v.t. | Nee | Prospect Run, Employee | openai-analyzer | Ja (als code-laag) |

## 4. Bestaande Tool Registry (agent-core)

`ToolRegistry` + `ToolAdapterRegistry` + `ToolDefinition`:

- **Aanwezig:** id, name, category (BROWSER/FILESYSTEM/TERMINAL/API/MCP), description, capabilities, riskLevel, requiredPermissions, inputSchema, outputSchema, enabled.
- **Defaults fail-closed:** alle tools `enabled: false`; runtime-adapter enabled alleen `http` + registreert alleen `HttpAdapter`; browser/filesystem/terminal/mcp blijven NOT_IMPLEMENTED (geen adapter).
- **Ontbrekend t.o.v. gewenst ontwerp (FASE 1):** `version`, `requiresApproval` (nu afgeleid van riskLevel: HIGH/CRITICAL → approval), `tenantPolicy`, `auditEnabled`, `timeout`, `rateLimit`. Er is géén per-tenant tool-policy-laag (FASE 9).
- **Approval:** `requiresHumanApproval(risk)` in gate: alleen HIGH/CRITICAL → menselijke approval via ApprovalEngine (PENDING→APPROVED/REJECTED/EXPIRED). Employee-workflow heeft een eigen persisted approval-gate (approveAction) bovenop de dispatcher-policy.

## 5. Beveiligingsstatus (FASE 4/19)

- SSRF: hostname + DNS-validatie vóór elke fetch, redirects per hop her-gevalideerd (adapter + bridge pre-flight) — **intact**.
- Fail-closed: onbekende tool/disabled tool/ontbrekende permission/onbekende agent → REJECTED; ontbrekende adapter → NOT_IMPLEMENTED; malformed input → REJECTED.
- Evidence/audit: ExecutionGate-output + evidence store + recorder (run/execution/evidence), audit-manifests (prospect), work-session steps.
- **Risico (FASE 19):** websites die de agent leest zijn **untrusted input** — de research-summary is genormaliseerd en bounded, maar er is géén expliciete prompt-instructie "webcontent is data, geen instructies" (prompt-injection-risico bij het doorgeven van research-output aan het model).
- Geen shell/email/GitHub/CRM/browser-adapters actief → geen exfiltratie-pad via tools.

## 6. Ontbrekende platformlagen (FASE 1–18)

| Laag | Status | Toelichting |
|---|---|---|
| Centrale tool-metadata (version/timeout/rateLimit/tenantPolicy) | M | ToolDefinition dekt kern; uitbreiding nodig |
| Tenant tool-policies | M | `prospect_tenants`/employee-sessions hebben tenant_id; geen per-tenant tool-matrix |
| Tool Discovery (FASE 16) | M | nu 1 tool; bij meer tools nodig (token/latency) |
| Agent budgets (FASE 8) | M | alleen maxToolRounds=2 in de tool-loop; geen maxSteps/maxCost/maxRuntime/maxNetworkRequests |
| MCP-adapter (FASE 3) | M | alleen conceptuele MCP_TOOL |
| GitHub-adapter (FASE 4) | M | — |
| Browser-adapter (FASE 5) | M | alleen conceptuele BROWSER_TOOL |
| Web search | M | geen zoekadapter |
| Metrics/observability (FASE 12) | M | recorder-tabellen + logs bestaan; geen counters (tool_calls_total, approval_pending_total, …) |
| Tool composition (FASE 17) | M | lead_research-keten bestaat als code (discovery-pipeline), niet als registry-compositie |
| Model-abstraction (FASE 13) | I-P | OpenAI Responses API in assistant + analyzer; DeepSeek compatibel (zelfde API-vorm) maar geen formele provider-laag |

## 7. Conclusie

De kern van een Agent Operating Layer **bestaat al en werkt**: ToolRegistry, PolicyEngine (fail-closed), ExecutionGate, ApprovalEngine, HttpAdapter (SSRF + bounded), evidence/audit, tenant-id's, HITL in de employee-flow. De volgende taken (FASE 1/2: registry-metadata + permission-model; daarna risk/approval/discovery; daarna adapters één voor één) bouwen hierop voort — **geen nieuwe architectuur nodig, alleen uitbreiding van de bestaande lagen**.
