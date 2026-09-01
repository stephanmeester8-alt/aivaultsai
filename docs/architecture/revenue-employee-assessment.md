# AIVaultsAI Autonomous Revenue Employee
## Repository & Architecture Assessment

> **Opdracht:** Analyse van de bestaande repository als basis voor de "Autonomous Revenue Employee".
> **Geanalyseerde checkout:** `C:\deepseek-lab\task22\aivaultsai` (zelfde remote als `C:\aivaultsai-new`; bevat de recentste lokale commits).
> **Branch:** `release/attribution` · **HEAD:** `9288fdb` · **Datum:** 1 september 2026.
> **Bewijsstandaard:** `FACT` = geverifieerd in code/tests · `INFERENCE` = afgeleid uit code · `RECOMMENDATION` = voorstel · `NOT FOUND` = niet aangetroffen · `UNVERIFIED` = niet verifieerbaar in deze omgeving.
> **Status:** analyse-only. Geen commit, geen push, geen deploy, geen productiewijziging.

---

## 1. Executive Summary

AIVaultsAI beschikt al over een **verrassend complete fundering** voor de Revenue Employee, maar nog niet over de revenue-specifieke lagen:

- **Customer Zero** (assistant → commercial intent → lead → events → qualification → afspraak) is operationeel, getest (incl. dependency injection) en aangesloten op de publieke assistent (`FACT`).
- **Agent Runtime** (`packages/agent-core`) is een volwaardige, deterministische runtime met policy engine, approval engine, execution gate, evidence store, handoff engine en task engine — alles fail-closed (`FACT`).
- **Prospect Run** (prospect-agent, scoring, policy, email-dispatcher, repository, audit-manifests, OpenAI-analyzer) bestaat als gecontroleerde single-run pipeline met HITL-standaard (`FACT`).
- **Het bekende read-then-write concurrency-risico is inmiddels correct gefixt** met een atomaire conditionele UPDATE (`claimConversationRuntimeRun`; `claimProspectRun`) (`FACT`).
- **De historische `leads_conversation_id_fkey`-fout is in de huidige werkende boom opgelost**: de testroute maakt eerst een echte `conversations`-rij aan (`FACT`).
- **Ontbrekend voor de Revenue Employee:** discovery (bedrijven zoeken), website-scanning, AI-detectie (chatwidget-signalen), contact research, campaigns/sequences-engine, scheduler/job queue (durable daily run), e-mailprovider, suppression list, reply-processing, learning/feedback loop, revenue dashboard/API, token/cost-observability (`FACT` — zie secties 9–11).
- **Tests:** web **211/211** pass (26 bestanden), agent-core **237/237** pass (11 bestanden); lint en production build waren groen bij de laatste validatie van deze checkout (`FACT`).
- **Aanbeveling:** bouw de Revenue Employee als **uitbreiding van de bestaande Prospect Run + Agent Runtime**, niet als parallel systeem. De kernarchitectuur (runtime, gate, policy, audit, idempotentie) is herbruikbaar; de nieuwe lagen zijn discovery, scanning/AI-detectie, contact research, campaign-engine, scheduler en learning-loop.

---

## 2. Current Architecture

```
C:\deepseek-lab\task22\aivaultsai
├── apps/web/                     Next.js 16.3.1 (Turbopack, app router)
│   ├── app/api/                  assistant, booking, customer-zero, db-health, prospect-runs
│   ├── components/               prospect-run/dashboard.tsx (niet publiek gemount)
│   ├── lib/
│   │   ├── assistant/            request-validatie, auth (bearer), rate limiter
│   │   ├── customer-zero/        commercial-intent, orchestrator (DI), funnel, persistence, qualification-validator
│   │   ├── booking/              service, providers (UnavailableCalendarProvider), persistence
│   │   ├── prospect-run/         prospect-agent, scoring, policy, email-dispatcher, repository, openai-analyzer, types
│   │   ├── agent-runtime/        runtime-adapter.ts (post-lead runtime taak)
│   │   ├── runtime/              postgres-run-recorder.ts
│   │   ├── db/                   client.ts (neon), migrations/001–003
│   │   ├── security/             rate-limit
│   │   ├── seo/ traffic/ analytics/  seo-scanner, attributie, gtag
│   ├── test/                     26 test-bestanden, 211 tests
│   └── scripts/                  inspect/verify-scripts, check-agent-core-copy, seo-scan
├── packages/agent-core/          @aivaultsai/agent-core (framework-vrij, in-memory engines)
│   └── src/                      agents, approvals, evidence, execution, handoffs, orchestration,
│                                 permissions, persistence, runtime, tasks, tools (+11 test-bestanden, 237 tests)
├── agents/                       contracten + agent-definities (markdown; geen runtime-code)
├── docs/                         architecture/, customer-zero/, security/, reports/, implementation-gap-matrix.md
└── scripts/                      task21b-live-validation.mjs
```

- Publieke flow: `/api/assistant` → validatie/auth/rate-limit → OpenAI → `maybeRunCustomerZeroOrchestration` (funnel: bestaande-lead-guard → orchestrator → runtime-taak → analytics; non-fatal) (`FACT`).
- Onge-trackt in deze checkout (bewust niet gecommit in eerdere taken): `apps/web/app/api/customer-zero/test-orchestrator/` en `scripts/` (`FACT`).

---

## 3. Existing Customer Zero

| Onderdeel | Status | Bewijs |
|---|---|---|
| Commercial intent classifier | `FACT` — deterministische regex-classifier, 4 levels (INFORMATIONAL → HIGH_COMMERCIAL_INTENT), score 0–10, reasons | `apps/web/lib/customer-zero/commercial-intent.ts` |
| Orchestrator | `FACT` — DI (`OrchestratorDeps`: createLead/createQualification/recordLeadEvent; `defaultOrchestratorDeps()`); messageId-correlatie; lead_created éénmalig via createLead; lead_qualified alleen na geslaagde persistentie; non-fatal | `apps/web/lib/customer-zero/orchestrator.ts` (commit `eec0e6e`) |
| Lead persistence | `FACT` — `createLead` + lead_created event, retourneert `leadCreatedEventId` | `persistence/lead-repository.ts` |
| Lead events | `FACT` — append-only, non-fatal, retourneert event_id | `persistence/lead-events.ts` |
| Qualification | `FACT` — score 0–100, confidence LOW/MEDIUM/HIGH, verplicht ≥1 supportingEventId | `persistence/qualification-repository.ts` |
| Funnel-integratie | `FACT` — één lead per conversatie (guard), runtime-taak idempotent, GA4 non-fatal | `lib/customer-zero/assistant-funnel.ts` |
| Booking | `FACT` — service + provider-factory; productie gebruikt `UnavailableCalendarProvider` (geen fake-slots; echte provider = stop-condition) | `lib/booking/*`, `test/booking-unavailable.test.ts` |
| Historische FK-fout | `FACT` — `leads_conversation_id_fkey` is opgelost: testroute (`test-orchestrator/route.ts`, untracked) maakt eerst `INSERT INTO conversations DEFAULT VALUES RETURNING id` | werkende boom, sectie PHASE 4 |

Trace (FACT): `POST /api/assistant` → `parseAssistantRequest` → auth + rate-limit → model-call → `maybeRunCustomerZeroOrchestration` → `hasExistingLead` (DB) → `runCustomerZeroOrchestrator(input, deps=default)` → `detectCommercialIntent` → `deps.createLead` (lead + lead_created) → intent-event → (QUALIFIED?) → `deps.createQualification` (supportingEventIds=[leadCreatedEventId]) → lead_qualified → `runConversationRuntimeTask` (idempotent) → `fireFunnelAnalytics`.

---

## 4. Existing Prospect Run

| Onderdeel | Status | Bewijs |
|---|---|---|
| Prospect agent | `FACT` — staged workflow: atomair `claimRun` (conditionele UPDATE, `state INTAKE → ANALYZING`) → `analyze` (PII-gesaneerd) → `scoreProspect` → `matchSalesRoute` → `draftOutreach` → `RunManifest`; states INTAKE/ANALYZING/…/BLOCKED; non-fatal | `lib/prospect-run/prospect-agent.ts` |
| Scoring | `FACT` — `scoreProspect`: opportunity×0.55 + evidence×0.45 − uncertainty×0.2, geklemd 0–100; unknown-data verlaagt de score | `lib/prospect-run/scoring.ts` |
| Route matching | `FACT` — 3 routes: `SOVEREIGN_LOCAL_AI` / `BYOK_COST_REDUCTION` / `HITL_COMPLIANCE` (compliance > kostenreductie) | `scoring.ts` |
| Policy | `FACT` — verified business email, opt-out, warm-up, rate-allowed, HITL-standaard; SHA-256 recipient-hash; PII-redactie; token-template | `lib/prospect-run/policy.ts` |
| Email dispatcher | `FACT` — fail-closed; `HUMAN_REVIEW` → QUEUED zonder provider-aanroep; `AUTO_SEND` vereist provider + alle gates; idempotency-key `runId:hash` | `lib/prospect-run/email-dispatcher.ts` |
| Repository | `FACT` — claim (atomic), create (idempotent `ON CONFLICT (tenant_id, idempotency_key)`), manifest + `audit_manifests` (SHA-256) | `lib/prospect-run/repository.ts` |
| Intelligence | `FACT` — `inferProspectIntelligence` (deterministisch) + `openai-analyzer.ts` (Responses API, strict JSON-schema, fail-safe fallback, PII-redactie, lazy key) | `lib/prospect-run/openai-analyzer.ts` |
| API | `FACT` — `POST /api/prospect-runs` admin-only (PROSPECT_RUN_API_KEY bearer); 503/401/400/202/409 | `app/api/prospect-runs/route.ts` |
| Dashboard | `FACT` — component bestaat, bewust niet publiek gemount; geen auth-route | `components/prospect-run/dashboard.tsx` |

**Niet aanwezig in Prospect Run (FACT):** discovery (bedrijven zoeken), website-scan, AI-detectie, contact research, campagne/sequence-engine, scheduler, e-mailprovider-implementatie, suppression list, reply-verwerking, learning-loop, KPI-tracking. De pipeline begint bij een handmatig aangeleverde `ProspectInput`.

---

## 5. Existing Agent Runtime

**`packages/agent-core` (FACT):**
- `AgentRuntime` (in-memory): lifecycle `RECEIVED → PLANNED → POLICY_CHECKED → (APPROVAL_REQUIRED → APPROVED) → READY_FOR_EXECUTION → EXECUTING → COMPLETED | FAILED | HANDED_OFF`; deterministisch; elke stap delegeert naar een engine.
- `ExecutionGate`: voert alleen uit bij policy ALLOW ∧ approval voldaan ∧ tool enabled ∧ adapter geregistreerd ∧ input valide; adapters draaien uitsluitend binnen de gate; ontbrekende adapter = expliciet `NOT_IMPLEMENTED`.
- `PolicyEngine`: puur, fail-closed (default DENY); regels: unknown/inactive agent, unknown/disabled tool, permissions, risico+approval, prohibited tools.
- `ApprovalEngine`: PENDING → APPROVED/REJECTED/EXPIRED; `requiresHumanApproval`.
- `EvidenceStore`: append-only; `executionOccurred:true` alleen bij echte executie.
- `HandoffEngine`, `TaskEngine` (volledige lifecycle incl. FAILED→READY retry), `ToolRegistry`/`ToolAdapterRegistry` (FilesystemAdapter root-scoped, HttpAdapter read-only SSRF-guarded).
- `RunRecorder`-port (default `NoopRunRecorder`) — append-only audit sink.

**`apps/web` integratie (FACT):**
- `lib/agent-runtime/runtime-adapter.ts`: fresh runtime per request; één post-lead taak per conversatie (`research_intelligence`, tool `http` → `/sitemap.xml`, MEDIUM risk, `API_REQUEST`); **idempotentie via atomaire claim**; recorder-writes worden geflushed vóór return (serverless-safe).
- `lib/runtime/postgres-run-recorder.ts`: schrijft run/execution/evidence naar migratie-002-tabellen; non-fatal.

**Concurrency/idempotentie (FACT — het bekende risico is gefixt):**
- Oud patroon (read → write) is vervangen door atomaire state-transities: `claimConversationRuntimeRun` (`UPDATE conversations SET metadata… WHERE metadata->>'runtime_run_id' IS NULL RETURNING …`) en `claimProspectRun` (`UPDATE prospect_runs SET state='ANALYZING' WHERE state='INTAKE' AND locked_at IS NULL`). Unieke constraints: `prospect_runs (tenant_id, idempotency_key)`, `email_sequences.idempotency_key UNIQUE`, `conversation_messages_unique_sequence`. (Commit `6c7a469` + tests `agent-runtime-adapter.test.ts`, `prospect-run.test.ts`.)

---

## 6. Existing Database

Migraties (`apps/web/lib/db/migrations/`, FACT):

| Migratie | Tabellen | Opmerking |
|---|---|---|
| `001_customer_zero.sql` | `conversations`, `conversation_messages`, `leads`, `lead_events`, `lead_qualifications`, `appointments` | FKs: leads→conversations (de historische `leads_conversation_id_fkey`), events→leads/messages, qualifications→leads; unieke constraints |
| `002_agent_runtime.sql` | `agent_runs`, `runtime_tasks`, `runtime_approvals`, `runtime_executions`, `runtime_evidence`, `runtime_handoffs` | runtime-persistentie voor recorder |
| `003_prospect_run.sql` | `prospect_tenants` (CREDITS/BYOK), `prospect_runs`, `scoring_metrics`, `email_sequences`, `prospect_opt_outs`, `audit_manifests` | manifest + SHA-256; sequence-idempotentie |

**Niet aanwezig (FACT):** `companies`, `company_domains`, `prospects`, `contacts`, `company_signals`, `website_scans`, `ai_detections`, `prospect_scores`, `prospect_routes`, `campaigns`, `campaign_members`, `email_messages`, `email_events`, `suppression_list`, `agent_approvals`/`agent_evidence` als aparte tabellen (approval/evidence zitten in runtime_*), organisatie/RBAC-tabellen. `prospect_tenants` is de enige multi-tenant-aanzet. `lead_events`/`qualification_events` bestaan als concept via `lead_events` + `lead_qualifications`.

---

## 7. Existing Tests

| Suite | Bestanden | Tests | Resultaat (vandaag uitgevoerd) |
|---|---|---|---|
| `apps/web` | 26 | 211 | **211 pass / 0 fail / 0 skipped** |
| `packages/agent-core` | 11 | 237 | **237 pass / 0 fail / 0 skipped** |

Relevante dekking (FACT): orchestrator-DI zonder DB, prospect-run (scoring, route, policy, dispatcher, agent-claim), openai-analyzer (fake fetch, PII-redactie, fallbacks), runtime-adapter (atomaire claim), recorder, policy/approval/gate/handoff/task-engines, booking-unavailable, assistant auth/request, rate-limit, SEO-suite, attributie. Lint en production build: groen bij laatste validatie van deze checkout (`FACT`, commit `1fffc55`-validatie; build opnieuw uitgevoerd in deze sessie vóór deze analyse was niet nodig — geen code gewijzigd).

---

## 8. Existing Infrastructure

| Onderdeel | Status |
|---|---|
| Node toolchain | `FACT` — Node v24.13.0, npm 11.6.2, git 2.53.0; **3 node.exe op PATH** (Program Files, lokale nodejs-v24, Cursor-helper) — quirk, geen blokkade |
| Package-manager | `FACT` — npm (lockfiles per app; `apps/web/package-lock.json` heeft pre-existing drift rond `@emnapi/*` — `npm ci` faalt daardoor; `npm install` werkt) |
| Netwerk | `FACT` — HTTPS naar GitHub/chatgpt.com wordt door de sandbox geblokkeerd (schannel SEC_E_NO_CREDENTIALS); npm-registry en Node-fetch werken |
| Deployment | `FACT` — Vercel (project `aivaultsai`, productiebranch `main`, domein aivaultsai.one); deploy-flow: push → PR → merge → auto-deploy; geen cron/`vercel.json` met scheduled jobs (`NOT FOUND`) |
| Secrets | `FACT` — `DATABASE_URL`, `OPENAI_API_KEY`, `ASSISTANT_API_KEY`, `PROSPECT_RUN_API_KEY`, `OPENAI_ASSISTANT_MODEL` via omgeving; **geen `.env.example`** (`NOT FOUND`); `apps/web/.env.local` aanwezig (niet gelezen/gewijzigd) |
| Scheduler/job queue | `NOT FOUND` — geen cron-configuratie, geen queue/durable worker in de repo |
| E-mailprovider | `NOT FOUND` — alleen de `EmailProvider`-interface + fail-closed dispatcher |

---

## 9. What Can Be Reused

1. **Prospect Run-pipeline** (`FACT`) — claim, scoring, policy, dispatcher, repository, manifest/audit; uitbreiden i.p.v. herbouwen.
2. **OpenAI-analyzer** (`FACT`) — Responses API, strict JSON-schema, fail-safe fallback; herbruikbaar voor AI-detectie- en opportunity-reasoning-stappen.
3. **Agent Runtime + engines** (`FACT`) — runtime, policy, approval, gate, evidence, handoff, task engine; de Revenue Employee draait hierop.
4. **Idempotentie-patronen** (`FACT`) — conditionele claims, `ON CONFLICT`, unieke constraints; toepassen op alle nieuwe operaties.
5. **Audit-manifest-patroon** (`FACT`) — SHA-256-manifesten; uitbreiden naar runs/emails/approvals.
6. **Recorder/persistentie** (`FACT`) — postgres-run-recorder + migratie 002; uitbreiden met token/cost.
7. **Policy-functies** (`FACT`) — verified email, opt-out-hash, sanitization, renderTemplate.
8. **Booking-provider-patroon** (`FACT`) — provider-factory + expliciete unavailable-state (geen fakes).
9. **Assistent-auth/rate-limit** (`FACT`) — bearer + rate limiter als patroon voor admin-API's.
10. **Documentatie-contracten** (`FACT`) — `agents/contracts/*`, `docs/architecture/*` sluiten aan op de code (geverifieerd voor runtime/gate/prospect-run).

---

## 10. What Must Be Changed

1. **Route matching** (`NEEDS EXTENSION`) — bestaande 3 routes (SOVEREIGN_LOCAL_AI/BYOK_COST_REDUCTION/HITL_COMPLIANCE) dekken niet de nieuwe productroutes (A: AI Assistant, B: Automation, C: Website+AI, D: Custom Automation). Uitbreiden met evidence-based mapping, niet vervangen.
2. **Scoring** (`NEEDS EXTENSION`) — regelgebaseerde score uitbreiden met LLM-opportunity-reasoning (evidence + reasoning + confidence + uncertainty) terwijl de bestaande score-componenten behouden blijven (backwards compatible, persisted).
3. **Email dispatcher** (`NEEDS PROVIDER`) — provider-implementatie + bounce/opt-out/unsubscribe-webhook; dispatcher-logica zelf blijft.
4. **Prospect-run API/dashboard** (`NEEDS EXTENSION`) — van single-run naar run-reeksen, campaigns en read-back voor een revenue-dashboard; dashboard achter auth.
5. **Observability** (`MISSING`) — recorder uitbreiden met `arguments_hash`, `token_usage`, `model`, `cost`, `latency` (kolommen of manifest-velden).
6. **HttpAdapter-bounds** (`NEEDS EXTENSION`) — voor website-scanning/AI-detectie zijn ruimere (maar strikt gecontroleerde) fetch-mogelijkheden nodig: allowlist, robots/ToS, rate limits, timeouts, max bytes per domein; SSRF-guards behouden.
7. **Agent-core persistentie** (`NEEDS DECISION`) — engines zijn in-memory; voor scheduled/durable runs is een persistent task/run-model nodig (recorder → repository), of een expliciete keuze om runs per worker in-memory te houden met DB-claims.
8. **Migrations** — nieuwe tabellen toevoegen (sectie 16), bestaande niet breken.

---

## 11. What Is Missing

| Capability | Status | Toelichting |
|---|---|---|
| Prospect discovery (bedrijven zoeken) | `MISSING` | geen zoek-/enrichment-bron |
| Website scanner / crawler | `MISSING` | alleen read-only HttpAdapter (sitemap) |
| AI-detectie (chatwidgets, providers, scripts) | `MISSING` | gewenst: evidence-based output `{ai_assistant_present, confidence, evidence, checked_pages, detected_technologies}`; expliciet NIET woord-"AI"-gebaseerd |
| Business/opportunity signals | `MISSING` | alleen handmatige `publicSignals`/`crmSignals` |
| Contact research | `MISSING` | company/domain/contact/role/source/confidence-model ontbreekt |
| Campaigns/sequences-engine | `MISSING` | tabel `email_sequences` bestaat; geen engine, geen `campaigns`/`email_messages`/`email_events` |
| Suppression list | `MISSING` | `prospect_opt_outs` bestaat; geen generieke `suppression_list`, geen unsubscribe-webhook |
| Scheduler + job queue + durable worker | `MISSING` | geen cron, geen queue; dagelijkse run kan niet binnen één Vercel-request |
| Follow-ups / reply-processing / positieve-reactie-detectie | `MISSING` | — |
| Learning/feedback loop (KPI's, score-calibratie, versioned prompts) | `MISSING` | — |
| Memory/state machine (company lifecycle: researched → contacted → … → lost) | `MISSING` | moet persisted business state zijn, geen LLM-memory |
| Revenue dashboard + admin API | `MISSING` | component bestaat, geen route/auth/data-API |
| RBAC/ABAC admin | `MISSING` | alleen bearer-keys |
| Token/cost-tracking, model routing | `MISSING` | analyzer heeft model-optie, geen router/cache |
| `.env.example` / config-documentatie | `MISSING` | — |

---

## 12. Architecture Risks

1. **Scheduler-afwezigheid (HOOG)** — een "daily revenue run" is niet uitvoerbaar binnen één Vercel-serverless-request (scan+LLM+outreach overschrijdt limieten). `RECOMMENDATION`: Vercel Cron (max ~frequentiebeperkingen) als trigger + een durable job-tabel + queue-achtige claim-loop; voor de eerste schaal volstaat "cron → POST admin API → per-prospect jobs met atomaire claims".
2. **In-memory agent-core engines (MEDIUM)** — oké per request (fresh runtime), maar geen cross-instance task-state; voor scheduled runs is persistent state vereist.
3. **Webscraping-uitbreiding (HOOG)** — scanning van externe sites introduceert SSRF/ToS/rate-limit-risico's; `HttpAdapter` is nu bewust tight (32 KB/5 s/2 redirects). `RECOMMENDATION`: aparte, strikt begrensde scan-pipeline met domein-allowlist en per-domein rate limits; nooit onbeperkt autonoom browsen.
4. **LLM als state-houder (HOOG, principieel)** — de regel "database = source of truth" moet voor alle nieuwe state gelden (prospects, runs, emails, approvals). Bestaande code voldoet hier al aan (`FACT`).
5. **E-mail reputatie (HOOG)** — zonder provider, warm-up en rate limits ontstaat spam/burn-risico; HITL-standaard + harde campaign limits zijn de eerste verdediging.
6. **Multi-tenant vooruitbouw (LAAG nu)** — `prospect_tenants` bestaat; geen org/user-model; `RECOMMENDATION`: alle nieuwe tabellen krijgen `tenant_id` waar relevant, maar geen volledige tenant-infrastructuur nu.

---

## 13. Security Risks

1. **Secret-exposure historie (HOOG)** — in een eerdere lab-sessie is een DeepSeek API-key in een chat gelekt en kon een harness-agent `C:\Users\Startklaar\.dsh\.credentials.yaml` lezen. `RECOMMENDATION`: credentials nooit binnen een agent-leesbare workspace; key-rotatie afronden.
2. **Prompt injection via website-inhoud (HOOG)** — gescande site-tekst gaat naar de LLM (AI-detectie/opportunity); output moet worden gevalideerd (strict JSON, evidence-contracten) en nooit als instructie worden behandeld.
3. **Admin-endpoints (MEDIUM)** — alleen statische bearer-keys (`PROSPECT_RUN_API_KEY`, `ASSISTANT_API_KEY`); geen RBAC, geen key-rotatie-mechanisme, geen audit van wie wat deed.
4. **Email-content-injectie (MEDIUM)** — LLM-drafts moeten door output-validation (lengte, claims, links) en policy vóór verzending.
5. **PII/compliance (MEDIUM)** — contact research mag geen onbewezen persoonsgegevens gebruiken; bron/evidence per contact verplicht; opt-out/unsubscribe fail-closed (bestaat al in `dispatchAllowed`).
6. **SSRF (LAAG, geborgd)** — bestaande `HttpAdapter` is SSRF-guarded; uitbreidingen moeten de guards behouden.

---

## 14. Scalability Risks

1. **Geen queue (HOOG bij opschaling)** — 100k+ users / grote prospectvolumes vereisen durable jobs; nu is alles request-gebonden.
2. **In-memory engines (MEDIUM)** — horizontaal schalen vereist persisted task/run state of DB-claims (patroon bestaat al voor claims).
3. **Neon serverless Postgres (LAAG)** — geschikt voor huidige schaal; verbindingen beheren via bestaande lazy-client.
4. **LLM-kosten (MEDIUM)** — geen token/cost-budgettering; bij dagelijkse runs over honderden prospects wordt dit materieel. `RECOMMENDATION`: model routing (cheap voor detectie/classificatie, sterk voor outreach), caching, token-budgetten, prompt-versioning.
5. **Monolith-keuze (GOED)** — modular monolith + durable jobs is de juiste eerste schaal; geen microservices nu.

---

## 15. Proposed Revenue Employee Architecture

```
Admin/UI  →  Revenue API (admin, RBAC)  →  Revenue Employee Runtime (apps/web/lib/revenue-employee/)
                                                     │
                        ┌────────────────────────────┼────────────────────────────┐
                        ▼                            ▼                            ▼
              Daily Revenue Run               Capability Workers           Agent Runtime (bestaand)
              (durable, scheduled)            (discovery, scan, ai-        (policy, approval, gate,
                        │                      detect, contact, outreach)   evidence, handoff, recorder)
                        ▼                            │                            │
              Revenue Job Queue (DB-claims)          ▼                            ▼
                        │                    Prospect/Company/Contact      Persistence (migraties 004+)
                        └────────────────────►  state machine + audit ───►  PostgreSQL (source of truth)
```

- Bestaande Prospect Run blijft de kern van de per-prospect pipeline; nieuwe workers voegen discovery/scan/AI-detectie/contact toe vóór scoring/route/outreach (`RECOMMENDATION`).
- Alles draait door de bestaande `ExecutionGate`/policy-keten; geen directe tool-aanroepen buiten de gate.
- Autonomie per level (sectie 26) via policy + approval-engine.

---

## 16. Proposed Data Model

Nieuwe migratie `004_revenue_employee.sql` (`RECOMMENDATION`; bestaande tabellen ongewijzigd):

- `companies` (company_id PK, tenant_id, name, domain UNIQUE, industry, employee_count, website_url, created_at) — idempotent per domein.
- `company_domains` (domain PK, company_id FK, source, verified_at) — aparte domein-tabel voor aliassen.
- `prospects` (prospect_id PK, company_id FK, tenant_id, status: researched|contacted|replied|interested|meeting|customer|lost|suppressed, score, route, last_state_change_at, UNIQUE(tenant_id, company_id)).
- `contacts` (contact_id PK, company_id FK, role, email_hash, source, confidence, evidence, created_at; **nooit ruwe onbewezen persoonsdata**).
- `company_signals` (signal_id PK, company_id FK, signal_type, value, evidence, source, detected_at).
- `website_scans` (scan_id PK, company_id/domain FK, url, http_status, fetched_at, content_hash, summary, error).
- `ai_detections` (detection_id PK, scan_id FK, ai_assistant_present bool, confidence numeric, evidence jsonb, checked_pages jsonb, detected_technologies jsonb, model, created_at).
- `prospect_scores` / `prospect_routes` (score_id/route_id PK, prospect_id FK, score/rationale resp. route/reason/confidence/evidence, version).
- `campaigns` + `campaign_members` (campaign_id PK, tenant_id, name, autonomy_level, limits; member = prospect_id + state).
- `email_messages` (message_id PK, sequence_id FK, recipient_hash, subject, body_hash, provider_message_id, sent_at, status) + `email_events` (delivered|opened|replied|bounced|opted_out, occurred_at, metadata).
- `suppression_list` (recipient_hash PK, reason, source, created_at) — naast bestaande `prospect_opt_outs`.
- `revenue_jobs` (job_id PK, kind, payload_hash, state, attempts, run_id FK, claimed_at, UNIQUE(kind, payload_hash)) — durable queue.
- `revenue_run_metrics` (run_id FK, date, counts per stage, response/meeting/conversion rates) — learning-loop.
- `agent_tool_calls`/observability: uitbreiden `runtime_executions` of `audit_manifests` met `arguments_hash`, `token_usage`, `model`, `cost`, `latency`.

---

## 17. Proposed Agent/Worker Model

Gespecialiseerde workers (`RECOMMENDATION`), allemaal agent-core agents met eigen capability-set:

| Worker | Taak | Capabilities | Model |
|---|---|---|---|
| `revenue_discovery` | bedrijven zoeken/dedupliceren | DISCOVERY, WRITE prospect | cheap |
| `website_analyzer` | website scan + AI-detectie | API_REQUEST (begrensd), WRITE scans/detections | cheap (classificatie) |
| `opportunity_analyzer` | pain points, opportunity, score-reasoning | READ signals, WRITE scores | strong |
| `contact_researcher` | zakelijke contacten (evidence-based) | READ approved sources, WRITE contacts | strong (met validatie) |
| `outreach_writer` | gepersonaliseerde draft | READ prospect/signals, WRITE draft | strong |
| `outreach_dispatcher` | policy-gate + provider-send | SEND (alleen via provider + policy) | geen LLM |
| `revenue_reporter` | dagelijkse run-metrics + leer-signalen | READ metrics, WRITE report | cheap |

De bestaande `research_intelligence`-agent blijft voor de customer-zero post-lead taak. Registratie via `AgentRegistry` + `agents/definitions/`-patroon (`FACT`-basis).

---

## 18. Proposed Tool Model

- Hergebruik `ToolRegistry` + `ToolAdapterRegistry` + `ExecutionGate` (`FACT`).
- Nieuwe tools (alleen via gate, met adapters): `web.scan_domain` (uitbreiding HttpAdapter: allowlist, robots-respect, per-domein rate limit, harde byte/tijd-bounds), `prospect.write`, `contact.write`, `campaign.queue`, `email.send` (alleen provider-adapter + policy), `report.generate`.
- Tool-permissies per worker (sectie 19); `arguments_hash` voor audit en deduplicatie.
- Blijvend uit: browser-automation, terminal, mcp, filesystem (behalve expliciet enablement) — consistent met huidige default (`FACT`).

---

## 19. Proposed Permission Model

Tool-level permissions per worker (`RECOMMENDATION`, sluit aan op bestaande `requiredPermissions` + `evaluatePolicy`):

- **READ:** publieke websites (via scan-tool), goedgekeurde bedrijfsdata, goedgekeurde enrichment-bronnen, eigen runs/evidence.
- **WRITE:** prospect, qualification, evidence, campaign state, email draft, audit, metrics.
- **SEND:** uitsluitend via goedgekeurde provider én na policy-check (`dispatchAllowed` + campaign/domain limits + suppression + opt-out).
- **DENY (altijd):** wachtwoorden/private credentials, willekeurige accounttoegang, financiële transacties, onbeperkte externe acties, onbeperkte bulk-mail.
- Autonomie-levels (sectie 26) worden policy-parameters, niet losse codepaden; approval-engine dwingt HITL af waar policy dat vereist (`FACT`-mechanisme bestaat).

---

## 20. Proposed Daily Revenue Run

Durable scheduled workflow (`RECOMMENDATION`):

```
07:00  cron-trigger (Vercel Cron of externe scheduler)
  → POST /api/revenue/runs (admin) → revenue_jobs aanmaken (UNIQUE kind+payload_hash)
  → worker-claim per job (atomaire UPDATE, bestaand patroon)
  → discovery (nieuwe bedrijven, max n per run, budget)
  → deduplicatie (company_domains, idempotent)
  → website scan (begrensd, evidence)
  → AI-detectie (evidence-based, confidence)
  → business/opportunity signals
  → qualification + score (bestaande engine + LLM-reasoning)
  → route matching (nieuwe productroutes A–D, evidence)
  → contact research (alleen goedgekeurde bronnen)
  → outreach drafts (per prospect, policy-gecheckt)
  → policy-gate → approval (LEVEL 1) of low-risk auto (LEVEL 2/3 binnen limits)
  → campaign execution via dispatcher + provider
  → metrics + leer-signalen opslaan
  → rapport aan eigenaar (admin dashboard + evt. samenvatting)
```

Geen enkele run binnen één HTTP-request: elke fase is een aparte job met eigen claim, retry en audit (`RECOMMENDATION`).

---

## 21. Proposed Outreach Pipeline

```
draft (evidence-based: bedrijf, website, opportunity, pain point, route, waarde)
  → output-validation (lengte, claims, geen misleiding, geen impersonation)
  → duplicate-check (prospect/domain/campaign)
  → suppression/opt-out check (recipient_hash)
  → rate/campaign/domain limits
  → HITL approval (LEVEL 1) of policy-auto (LEVEL 2/3)
  → provider-send (idempotency-key, recipient-hash)
  → events (delivered/opened/replied/bounced/opted_out)
  → follow-up-planning (begrensd aantal, spacing)
  → reply-classificatie (positief/neutraal/negatief) → lead/afspraak-aanmaak bij positief
```

Regel: "Wij zagen dat…" uitsluitend wanneer het uit evidence volgt; nooit generieke AI-bedrijfsspam (`RECOMMENDATION`).

---

## 22. Idempotency Strategy

Alle operaties krijgen idempotency-keys (`RECOMMENDATION`, patronen bestaan al als `FACT`):

- company/domain: `UNIQUE(domain)` / `ON CONFLICT DO NOTHING`.
- prospect: `UNIQUE(tenant_id, company_id)`.
- job: `UNIQUE(kind, payload_hash)`; claim via conditionele UPDATE (bestaand patroon).
- run: `UNIQUE(tenant_id, run_date)` voor dagelijkse run.
- email: `email_sequences.idempotency_key UNIQUE` (bestaat) + `runId:recipientHash` (bestaat in dispatcher).
- scan/detection: `UNIQUE(domain, url, content_hash)`.
- agent task/run: `runtime_run_id`-claim (bestaat).
- Herhaling = no-op of expliciete nieuwe versie (versioned score/route).

---

## 23. Concurrency Strategy

- DB-level atomicity als primaire grens (geen mutex-hacks): conditionele UPDATE's, `ON CONFLICT`, unieke constraints, transacties waar meerdere writes samenhoren (`RECOMMENDATION`; bestaande claims zijn het bewijs van het patroon).
- Per-phase job-claims zodat twee workers nooit dezelfde fase van dezelfde prospect draaien.
- Optimistische concurrency (version-kolom) voor state-machine-overgangen (prospect status, campaign member state).
- Advisory locks alleen waar een UPDATE-conditie niet volstaat (niet verwacht in fase 1).

---

## 24. Observability Strategy

- Uitbreiding van de bestaande recorder/`audit_manifests` (`RECOMMENDATION`): per agent-run: `agent_run_id`, `task_id`, `agent`, `tool`, `arguments_hash`, `timestamp`, `result`, `policy_decision`, `latency`, `token_usage`, `model`, `cost`, `error`.
- Per email: provider_message_id, status, events (bestaande tabellen + nieuwe `email_events`).
- Revenue-dashboard (sectie 27) leest uitsluitend uit deze tabellen (database = source of truth).
- Loglijnen met run_id door de hele pipeline; geen secrets in logs (bestaande praktijk behouden).

---

## 25. AI Cost Strategy

- Model routing (`RECOMMENDATION`): cheap/fast (classificatie, extractie, AI-detectie, deduplicatie) vs. strong (opportunity-reasoning, moeilijke kwalificatie, gepersonaliseerde outreach).
- Caching: gescande pagina's op `content_hash`; analyse-output per (domain, model, prompt_version) cachebaar.
- Token-budgetten per job; structured outputs (strict JSON-schema — patroon bestaat in `openai-analyzer.ts`); prompt-versioning.
- Deduplicatie vóór elke dure stap (geen dubbele scans van hetzelfde domein).
- Default-model van de analyzer (`gpt-4o-mini`) als cheap-tier behouden; strong-tier configureerbaar.

---

## 26. Autonomy Levels

| Level | Research | Score | Draft | Send | Follow-up | Leer-loop | Voorwaarde |
|---|---|---|---|---|---|---|---|
| **1** | AI | AI | AI | Menselijke approval | Menselijk | Rapport | standaard; HITL via approval-engine |
| **2** | AI | AI | AI | Policy-auto (low-risk) | Policy-auto | Rapport | alle gates: verified email, geen opt-out, warm-up, rate, limits, suppression |
| **3** | AI | AI | AI | AI (harde limits) | AI | AI (versioned, evalueerbaar) | dagelijkse budgetten, domain limits, audit per stap, learning versioned |

Levels zijn policy-parameters per campaign/tenant (`RECOMMENDATION`); Level 1 is de productie-default (consistent met huidige HITL-standaard `FACT`).

---

## 27. Admin Dashboard

`/admin/revenue` (`RECOMMENDATION`, achter auth — bestaande component uitbreiden i.p.v. nieuw):

- Status: Working / Idle / Error (laatste run).
- Today's Run: companies researched, AI detected, no AI detected, qualified, high propensity, emails drafted, pending approval, sent, replies, meetings.
- Pipeline value; Top prospects (company, score, AI-status, confidence, opportunity, route, evidence, contact, outreach state, next action).
- Approvals-queue (Level 1), campaigns, audit-manifest-viewer, metrics/learning.
- Data uitsluitend uit DB; API: `/api/revenue/*` admin-only (bearer + later RBAC).

---

## 28. API Design

`RECOMMENDATION` (bestaande `/api/prospect-runs` blijft):

- `POST /api/revenue/runs` — start dagelijkse run (admin; idempotent per datum).
- `GET /api/revenue/runs/{runId}` — status + metrics.
- `POST /api/revenue/prospects/{id}/approve` · `POST /api/revenue/prospects/{id}/reject` — HITL.
- `GET /api/revenue/prospects` — filters (score, AI-status, route, state).
- `GET /api/revenue/campaigns` · `POST /api/revenue/campaigns` — campagnebeheer + limits.
- `POST /api/revenue/emails/{id}/send` (alleen na policy) · `POST /api/revenue/webhooks/unsubscribe` — opt-out/unsubscribe.
- `GET /api/revenue/metrics` — learning/KPI's.
- Auth: bearer (huidig patroon) → later RBAC-sessies; inputvalidatie zoals `parseAssistantRequest`/`validBody`; rate limiting.

---

## 29. Folder Structure

`RECOMMENDATION` — uitbreiding van bestaande patronen:

```
apps/web/lib/revenue-employee/
├── types.ts
├── revenue-agent.ts            # orchestratie per run (fases)
├── workers/                    # discovery, website-analyzer, ai-detection, opportunity,
│                               # contact-research, outreach-writer, dispatcher, reporter
├── ai-detection.ts             # evidence-based detectie (widgets/scripts/providers)
├── repository.ts               # claims, jobs, prospects, scans, detections, metrics
├── policy.ts                   # outreach/campaign limits (uitbreiding prospect-run/policy)
├── email-dispatcher.ts         # uitbreiding bestaande dispatcher (provider, events)
└── scheduler.ts                # cron-handler → jobs
apps/web/app/api/revenue/...    # admin API
apps/web/components/revenue/... # dashboard
apps/web/lib/db/migrations/004_revenue_employee.sql
packages/agent-core/src/...     # alleen uitbreiden waar nodig (definities, capabilities)
```

---

## 30. Migration Strategy

- Bestaande migraties 001–003 **niet wijzigen**; nieuwe `004_revenue_employee.sql` (sectie 16) volgt hetzelfde patroon (`CREATE TABLE IF NOT EXISTS`, constraints, indexes, `set_updated_at()`-triggers).
- Applicatie-uitvoering via bestaande run-scripts (`run-customer-zero-migration.mjs`-patroon) of Vercel-post-deploy; migratie blijft een expliciete handmatige stap (stop-condition, geen automatische migratie in deze omgeving).
- Backwards compatible: nieuwe kolommen met defaults; geen hernoemingen van bestaande tabellen.

---

## 31. Sprint Plan

`RECOMMENDATION` (taak-voor-taak, per protocol):

- **Sprint 0 — Fundering:** migratie 004 + repository-laag + job-claims + tests.
- **Sprint 1 — Discovery & scan:** discovery-worker, website scanner (begrensd), evidence-persistentie.
- **Sprint 2 — AI-detectie:** evidence-based detectie (widgets/scripts/providers), confidence, tests met fixtures.
- **Sprint 3 — Opportunity & score-uitbreiding:** LLM-reasoning naast bestaande score; nieuwe routes A–D.
- **Sprint 4 — Contact research:** goedgekeurde bronnen, contact-model, evidence.
- **Sprint 5 — Outreach & campaigns:** campaign-engine, dispatcher-provider, suppression, events, HITL-queue.
- **Sprint 6 — Daily run & scheduler:** cron → jobs → workers; metrics.
- **Sprint 7 — Dashboard & observability:** admin API, dashboard, token/cost, learning-loop.
- Iedere sprint: tests + lint + build + `git diff --check`; checkpoint-commits alleen op expliciete instructie.

---

## 32. Implementation Order

1. Migratie 004 + repository (claims, jobs, prospects) — *fundering, alles hangt eraan*.
2. Website scanner + AI-detectie (evidence-first; deterministisch testbaar).
3. Score-uitbreiding + route A–D (bestaande engine uitbreiden).
4. Outreach/campaign-engine + provider-interface + suppression.
5. Scheduler/job-loop + daily run.
6. Admin API + dashboard.
7. Observability (token/cost) + learning-loop (versioned).

---

## 33. Testing Strategy

- Unit: elke worker puur + geïnjecteerde deps (patroon bestaat: prospect-run, openai-analyzer, runtime-adapter).
- Geen echte database/netwerk in unit tests; fake fetch/sql (bestaand patroon).
- AI-detectie: fixture-HTML-bestanden (widgets: Intercom/Drift/Crisp/Tidio/…; scripts; iframes) met verwachte evidence/confidence.
- Idempotentie: dubbele claims/runs/emails → no-op (bestaand patroon uitbreiden).
- Concurrency: twee workers zelfde job → één wint (conditionele claim).
- Policy: fail-closed matrix (permissie/approval/limit-combinaties).
- Regressie: bestaande suites blijven groen (211 + 237); nieuwe suites per sprint.

---

## 34. Rollback Strategy

- Feature-flags per capability (discovery/scan/outreach per tenant/campaign).
- Migraties vooruit-only; rollback = nieuwe migratie, niet downgrade.
- HITL-standaard (Level 1) is de veiligste stand; Level 2/3 per campaign aanzetbaar en direct uitzetbaar.
- Provider-send alleen achter feature-flag + campaign-limits; audit-manifesten maken reconstructie mogelijk.
- Eerdere checkpoint-commits zijn de herstelpunten (bestaande git-praktijk).

---

## 35. Production Risks

1. E-mailreputatie/burn bij fout geconfigureerde auto-send (mitigatie: Level 1 default, limits, warm-up).
2. LLM-kosten bij dagelijkse runs (mitigatie: model routing, budgetten, caching).
3. Scraping-bans/ToS (mitigatie: begrensde scan, robots-respect, per-domein rate limits).
4. Prompt injection via gescande content (mitigatie: strict output-validation, evidence-contracten).
5. Datakwaliteit contacten (mitigatie: alleen goedgekeurde bronnen, confidence + evidence).
6. Vercel serverless-limieten voor lange runs (mitigatie: job-per-fase, geen lange requests).
7. Secrets/credentials (mitigatie: nooit in repo/workspace; rotatie-procedure; `.env.example` toevoegen).

---

## 36. Final Recommendation

**Aanbeveling: bouw de Autonomous Revenue Employee als een gecontroleerde uitbreiding van de bestaande Prospect Run + Agent Runtime** — niet als nieuw parallel systeem. De fundering (idempotente claims, policy/gate/approval/evidence, audit-manifests, DI, fail-closed dispatch, HITL-standaard) is bewezen en getest; de ontbrekende lagen zijn duidelijk afgebakend (discovery, scanning, AI-detectie, contact research, campaign-engine, scheduler, learning, dashboard).

Volgorde: eerst **Sprint 0 (migratie 004 + repository + job-claims)**, daarna **website scan + AI-detectie** (het meest onderscheidende en evidence-zware onderdeel), dan score/route-uitbreiding en pas daarna outreach/campaigns. Houd Level 1 (HITL) als productie-default; schakel hogere autonomie alleen per campaign in met harde policy-limits. Elke stap blijft taak-voor-taak met tests, lint, build en checkpoint-commits op expliciete instructie.

**Volgende concrete fase (voorstel, in afwachting van opdracht):**
- Nieuwe bestanden: `apps/web/lib/db/migrations/004_revenue_employee.sql`, `apps/web/lib/revenue-employee/{types,repository,revenue-agent,ai-detection}.ts`, tests `apps/web/test/revenue-employee*.test.ts`.
- Gewijzigde bestanden: `apps/web/lib/prospect-run/scoring.ts` (route-uitbreiding), `apps/web/lib/agent-runtime/runtime-adapter.ts` (indien nodig), `apps/web/app/api/prospect-runs/route.ts` (alleen indien nodig).
- Risico's: zie secties 12–14 en 35.

---

*Rapport gegenereerd op basis van daadwerkelijke code-inspectie en testuitvoering (web 211/211, agent-core 237/237). Niet-geverifieerde of niet-aangetroffen onderdelen zijn als `UNVERIFIED`/`NOT FOUND` gemarkeerd. Geen commit, geen push, geen deploy uitgevoerd.*
