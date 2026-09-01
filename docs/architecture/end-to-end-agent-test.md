# Agent Tool Platform — End-to-End Agent Test (TASK 26)

> Datum: 1 september 2026 · Branch: `release/attribution` · Sluit de ontwerpfase af (TASK 1–25).
> Doel: één e2e-testsuite die de **volledige agent-keten** doorloopt — employee-run → registry → policy → approval → execution → evidence — inclusief de cross-cutting lagen (budget TASK 16, observability TASK 24, tenant-policies TASK 25). Deze taak legt de e2e-asserties en testdubbels vast; de suite zelf wordt gebouwd tijdens de implementatiefase.

---

## 1. Uitgangspunt: bestaande situatie (FACT)

```text
Vandaag: 300 web-tests + 239 agent-core-tests, alle groen — maar per laag geïsoleerd
(fake fetch/lookup/clients/providers; geen echte DB/network in tests).

Consequentie-lijnen uit eerdere taken (verzameld):
  TASK 19 §11:  "TASK 26 (e2e): draft → approval → send is de centrale e2e-keten"
  TASK 21 §10:  "TASK 26 (e2e): approval → create → read-back als write/read-e2e-route"
  TASK 23 §10:  "TASK 26 (e2e): approval → calendar_create → calendar_read (slot weg) → cancel"
  TASK 24 §9:   "TASK 26 (e2e): elke stap levert een tool-call-record op (traceability-assertie)"
  TASK 25 §11:  "TASK 26 (e2e): per-tenant cases (A: OFF → DENY; B: APPROVAL → approval-flow)"
```

**Gevolg (FACT):** e2e is geen losse taak — het is de integratie-assertie over alle 25 ontwerpen; de testdubbels volgen het bestaande injectable-patroon (`lookup`, `fetchImpl`, `EmailProvider`, `CalendarProvider`, `CrmClient`).

## 2. Doel & principe

```text
E2E-SUITE (apps/web/test/agent-platform-e2e.test.ts) — 4 scenario's, alle met FAKES:

S1  employee full-run success   discovery → research → qualify → draft → WAITING_APPROVAL
                                 → approve → email_send → SENT
S2  employee reject-route       approveAction(reject) → REJECTED → géén provider-call
S3  tenant + budget cases       Tenant A: email_send OFF → DENY; Tenant B: APPROVAL → flow;
                                 budget-stop → budgetExceeded (TASK 16)
S4  read/write tools            calendar_read → contact_search → approval → crm write → read-back

Elke stap assert: tool-call-record (TASK 24), approvalId-koppeling, geen secrets,
ketenstatus (session-steps / email_drafts / appointments).
```

- **Keten-integriteit boven unit-dekking:** de suite faalt als een stap de registry, gate of recorder omzeilt — de fouten van de afzonderlijke lagen worden hier niet hertest, wél hun samenwerking.
- **Geen echte netwerk/DB:** alles via testdubbels (bestaand patroon); deterministisch en snel.

## 3. Testdubbels (hergebruik + nieuw)

| Dubbel | Basis | Gebruikt door |
|---|---|---|
| `FakeFetch` / `FakeLookup` | bestaand (prospect-run, SSRF-tests) | S1 research |
| `FakeEmailProvider` | `EmailProvider`-interface (TASK 19) | S1/S2 send + dispatch-gates |
| `FakeCalendarProvider` | `CalendarProvider` (TASK 22) | S4 calendar_read + write |
| `FakeCrmClient` / `FakeCrmWriteClient` | TASK 20/21-contracten | S4 |
| `FakeApprovalEngine`-context | echte `ApprovalEngine` (agent-core) + `TaskEngine` | S1–S4 (geen fake: engine is in-memory en puur) |
| `MemoryRecorder` | `MetricRecorder` (TASK 24) | alle scenario's (record-asserties) |
| `InMemoryTenantPolicies` | `tenant_tool_policies`-load (TASK 25) | S3 |

- **Testdubbels mogen geen beveiliging uitschakelen:** de gate/policy/approval draaien echt; alleen externe I/O is gefaked.

## 4. Scenario-asserties (per keten)

**S1 — full-run success**
1. `startWorkSession` → discovery (validated, deduped) → research via FakeFetch (SSRF-check actief) → qualify → draft in `email_drafts` (status DRAFT) → session `WAITING_APPROVAL`
2. `approveAction(approver)` → ApprovalEngine PENDING→APPROVED (self-approval-check actief: approver ≠ agent) → `email_send{draftId, approvalId}` → claim DRAFT→SENT → FakeEmailProvider aangeroepen met idempotencyKey → status SENT + providerMessageId
3. Asserties: session-steps (discovery/research_cached/decision/outreach_draft/approval), `tool_call_records` per stap (ALLOWED, approvalId gekoppeld bij send), audit bevat `argumentsHash` + `recipientHash` — **nooit** body/ruw adres, budget `usage` binnen limieten

**S2 — reject-route**
1. zelfde run → `rejectAction(approver)` → ApprovalEngine REJECTED
2. `email_send` met dezelfde approvalId → DENY (`APPROVAL_ALREADY_RESOLVED`); FakeEmailProvider **niet** aangeroepen; draft status CANCELLED (TASK 18-status)
3. Asserties: `approval_rejected_total` +1 (TASK 24), record DENIED met reden

**S3 — tenant + budget**
1. Tenant A: rij `email_send=OFF` → discovery sluit `email_send` uit én directe call → DENY (`TENANT_POLICY`); rij `website_research=ON` → beschikbaar
2. Tenant B: rij `email_send=APPROVAL` → MEDIUM-tool approval vereist via `resolveApprovalRequirement` (TASK 25); zonder approval → APPROVAL_REQUIRED
3. Budget: `maxToolCalls: 3` → run stopt bij budget met `budgetExceeded: true` + `agent_budget_exceeded_total` +1 (TASK 16/24); geen call na de limiet

**S4 — read/write tools**
1. `calendar_read` (FakeCalendarProvider met slots) → bounded slots; provider-unavailable variant → `available: false` (geen inventie)
2. `contact_search` (FakeCrmClient) → bounded, PII-redactie (notities niet in output)
3. approval → `contact_create{dedupeKey}` → idempotent herhaal (zelfde key) → `created: false` → `contact_search` read-back toont het record

## 5. Fail-closed-asserties (over alle scenario's)

| Check | Verwachting |
|---|---|
| Onbekende tool | DENY + record `tool_denied_total` |
| Missing permission | DENY (policy) |
| Disabled/missing adapter | DENY / NOT_IMPLEMENTED |
| Ongeldige argumenten | DENY (schema, `additionalProperties: false`) |
| SSRF | DENY (FakeFetch + lookup) |
| Expired approval | DENY |
| Budget op | STOP (geen volgende call) |
| Secrets | geen `sk-`/token/body in records of session-steps (grep-assertie) |

## 6. Voorgestelde bestanden (implementatie later)

- `apps/web/test/agent-platform-e2e.test.ts` — suite S1–S4
- `apps/web/test/doubles/` — `fake-email-provider.ts`, `fake-calendar-provider.ts`, `fake-crm-client.ts`, `memory-recorder.ts`, `in-memory-tenant-policies.ts`
- `apps/web/test/agent-platform-e2e-helpers.ts` — run-builder (sessie-config + deps + fakes)

## 7. Testmatrix (e2e-niveau)

S1 alle stappen ALLOWED + SENT + records · S2 reject → geen send + CANCELLED · S3 OFF→DENY / APPROVAL→flow / budget-stop · S4 read + write + read-back + idempotentie · correlatie approvalId in record · geen secrets in audit · determinisme (zelfde input → zelfde uitkomst) · suite blijft groen met alle 300+239 bestaande tests.

## 8. Conclusie ontwerpfase

Met TASK 26 is de **ontwerpfase compleet** (26/26). De 26 docs vormen het volledige implementatie-contract:

| Implementatiefase (voorstel) | Docs |
|---|---|
| Basis | 1–7 (audit t/m discovery) |
| Externe adapters | 8–12 (MCP/GitHub/browser) |
| Research-laag | 13–14 |
| Employee-laag | 15–17 (registry/budget/approval) |
| Email-laag | 18–19 |
| CRM/Calendar-laag | 20–23 |
| Platform-laag | 24–25 (observability/tenant) |
| Integratie & e2e | 26 |

Implementatie start pas na jouw expliciete opdracht — elke laag taak-voor-taak, met de FASE 18-testmatrices per tool.
