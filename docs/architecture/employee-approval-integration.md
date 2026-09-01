# Agent Tool Platform — Employee Approval Integration (TASK 17)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de employee budget-afspraken (TASK 16).
> Doel (FASE 10): de employee-tool-calls worden gekoppeld aan de **centrale `ApprovalEngine`** — `approveAction` blijft de **enige** route naar email-send, maar de menselijke beslissing wordt nu vastgelegd als first-class approval (PENDING → APPROVED / REJECTED / EXPIRED) met dezelfde bindingen als elke andere risicovolle tool-call. Deze taak legt het ontwerp vast; implementatie volgt samen met de TASK 15/16-files.

---

## 1. Uitgangspunt: bestaande situatie (FACT)

**Employee HITL-poort vandaag** (`apps/web/lib/autonomous-employee/orchestrator.ts`):

```ts
approveAction(sessionId, actionId, input, deps)   // regel 341
  poort-checks: sessie-status === "WAITING_APPROVAL"
                actie-status === "PENDING_APPROVAL"
  daarna: dispatchEmail(...)  // bestaande fail-closed dispatcher (opt-out/warm-up/rate/provider)
  → actie SENT | BLOCKED; stap "approval" in session-steps

rejectAction(sessionId, actionId, deps)           // regel 404
  → actie REJECTED; géén side effect

OutreachActionRecord.status = PENDING_APPROVAL | APPROVED | REJECTED | SENT | BLOCKED
// let op: "APPROVED" bestaat al in het type maar wordt vandaag NOOIT gezet
```

**ApprovalEngine vandaag** (`packages/agent-core/src/approvals/`, geverifieerd):

```ts
Approval { approvalId, taskId, requestedAction, riskLevel, requestedBy: AgentId,
           approvedBy: string|null, status: PENDING|APPROVED|REJECTED|EXPIRED,
           createdAt, resolvedAt }
createApproval → vereist bestaande task (TaskEngine) + bestaande agent (AgentRegistry)
approve/reject → self-approval geweigerd (approver ≠ requestedBy, approver géén AgentId)
expire()       → alleen vanuit PENDING
```

**TASK 6-ontwerp (nog niet geïmplementeerd):** `ApprovalV2` + `PARTIALLY_APPROVED`, `toolId`/`argumentsHash`/`tenantId`/`requiredApprovals`/`approvals[]`/`expiresAt` (TTL: HIGH 15 min), `ruleMaxRisk`, `ruleApprovalBinding`, `resolveApprovalRequirement` (TASK 25). **TASK 16-afspraak:** approval-wachttijd (WAITING_APPROVAL) valt buiten de runtime-klok van het budget.

**Gevolg (FACT):** de employee-approval is vandaag een eigen poort (`action.status` in de sessie-summary) **zonder** ApprovalEngine-record. Dat betekent: geen centrale binding (tool/argumenten), geen self-approval-preventie via de engine, geen approval-events in de centrale audit — de employee is daarmee de enige agent die níét door de standaard approval-laag gaat. TASK 17 sluit dit gat.

## 2. Doel & principe

```text
employee-run → draft → actie PENDING_APPROVAL  +  ApprovalEngine: PENDING
   → sessie WAITING_APPROVAL → UI (FASE 10-kaart)
   → approveAction(approver)  ── ENIGE route ──▶ ApprovalEngine.approve → APPROVED
        → dispatchEmail (tweede gate) → SENT | BLOCKED
   → rejectAction(approver)   → ApprovalEngine.reject → REJECTED → STOP (geen dispatch)
   → TTL verstreken           → EXPIRED → geen dispatch (fail-closed)
```

- De ApprovalEngine wordt **de enige autorisatiebron** voor email-send door de employee; `action.status` wordt een weerspiegeling van de approval-status (geen tweede beslissingslaag).
- **`APPROVED` betekent: een mens autoriseert exact deze actie** (sessie + actie + domein), nooit een permanente machtiging.
- Na `REJECTED`/`EXPIRED`: de actie mag **nooit** worden verstuurd en niet opnieuw worden goedgekeurd (engine weigert: `APPROVAL_ALREADY_RESOLVED`).

## 3. Approval-toewijzing (per outreach-actie)

| Approval-veld | Waarde | Toelichting |
|---|---|---|
| `approvalId` | `apr_employee_{sessionId}_{actionId}` | stabiel + deterministisch per actie; idempotente aanmaak |
| `taskId` | `task_employee_{sessionId}` | TaskEngine-taak, door de orchestrator aangemaakt bij de eerste approval (goal = sessiegoal, createdBy "system") — vereist door `createApproval` |
| `requestedAction` | `email_send:{domain}` | actie-binding in de huidige shape (domein per actie) |
| `riskLevel` | `HIGH` | komt uit ToolSpec `employee_email_send` (TASK 15) |
| `requestedBy` | `"autonomous-employee"` | AgentId; de employee-agent moet in de AgentRegistry bestaan |
| `approvedBy` | `null` (tot beslissing) | menselijke identiteit; géén AgentId |
| V2 (na TASK 6-impl.): `toolId` | `"employee_email_send"` | tool-binding (G1) |
| V2: `argumentsHash` | SHA-256 over `{sessionId, actionId, domain}` | argument-binding; **nooit** de body/credentials |
| V2: `tenantId` | sessie-`tenantId` | tenant-context |
| V2: `requiredApprovals` | `1` (HIGH) | 2 pas bij CRITICAL (later) |
| V2: `expiresAt` | `now + 15 min` | TTL HIGH (TASK 6-default) |

## 4. Flow (na integratie)

```text
1. RUN          orchestrator maakt draft (bestaand) → actie PENDING_APPROVAL
2. APPROVAL     idempotente createApproval(apr_employee_{sessionId}_{actionId}, …) → PENDING
                (stap "approval_created" in session-steps met approvalId)
3. SESSIE       WAITING_APPROVAL (bestaand) — runtime-klok van het budget staat stil (TASK 16)
4. UI           FASE 10-kaart (§6)
5. BESLISSING   approveAction(…, { approver, … }):
                a. poort-checks (bestaand): sessie WAITING_APPROVAL ∧ actie PENDING_APPROVAL
                b. TTL-check (V2): now > expiresAt → EXPIRED → weigeren (geen dispatch)
                c. engine.approve(approvalId, approver) → APPROVED
                   (self-approval en AgentId-approver worden door de engine geweigerd)
                d. actie.status = "APPROVED"   // type-veld wordt nu écht gebruikt
                e. dispatchEmail (bestaande tweede gate) → SENT | BLOCKED
                f. stap "approval" in session-steps: { actionId, approvalId, decision, dispatchStatus }
   rejectAction(…, { approver }):
                a. poort-checks (bestaand)
                b. engine.reject(approvalId, approver) → REJECTED
                c. actie.status = "REJECTED"; géén dispatch; stap "approval" { decision: "reject" }
```

## 5. Binding & scope (TASK 6-koppeling)

- **Huidige shape:** `requestedAction = email_send:{domain}` bindt per actie/domein; de poort-checks (sessie + actie) binden de rest. Een approval is dus nooit herbruikbaar voor een andere actie.
- **V2 (na TASK 6-impl.):** `ruleApprovalBinding` vergelijkt `toolId` + `argumentsHash` bij elke doorgave — elke mismatch → DENY. De employee gebruikt dan exact dezelfde binding als de runtime-orchestrator.
- `requiredApprovals: 2` (tweede ogen) wordt alleen relevant bij CRITICAL-tools; `employee_email_send` is HIGH → 1.

## 6. HITL-UI (FASE 10, approval-kaart)

| Veld | Inhoud voor employee |
|---|---|
| Agent | `autonomous-employee` |
| Goal | sessie-`sessionKey`/config (bv. "vind 20 installatiebedrijven…") |
| Tool | `employee_email_send` (HIGH) |
| Action | email versturen naar prospect |
| Target | `action.domain` |
| Arguments | `subject` + `optOutLine` (body alleen in de UI voor review — **nooit** in audit/logs) |
| Risk | HIGH — externe side effect |
| Expected consequence | outreach-e-mail wordt verzonden via de fail-closed dispatcher |
| Evidence | `runId`, session-steps, approvalId |
| Knoppen | Approve / Reject (menselijke identiteit) |

## 7. Fail-closed tabel

| Situatie | Beslissing |
|---|---|
| Geen ApprovalEngine geïnjecteerd | dispatch geweigerd in productie (fail-closed schakelaar §8); zonder engine = vandaag-gelijk in tests |
| approvalId onbekend | DENY (engine: `APPROVAL_NOT_FOUND`) |
| Status ≠ PENDING bij approve | DENY (`APPROVAL_ALREADY_RESOLVED`) — ook na reject/expire: geen tweede kans |
| TTL verstreken (PENDING) | EXPIRED → geen dispatch |
| Approver = agent / AgentId-identiteit | DENY (self-approval / `INVALID_APPROVER`) |
| Actie niet PENDING_APPROVAL | weigeren (bestaand) |
| Sessie niet WAITING_APPROVAL | weigeren (bestaand) |
| Dispatch-gates (opt-out/warm-up/rate/provider) | BLOCKED (bestaand) — approval is géén vrijbrief voor de dispatcher |
| Binding mismatch toolId/argumentsHash (V2) | DENY |

## 8. Migratie & backwards compatibility

| Stap | Wat | Effect |
|---|---|---|
| 1 | `deps.approvals?: ApprovalEngine` + `createApproval` bij draft (idempotent; task-aanmaak `task_employee_{sessionId}`) | bestaande tests groen (optionele dependency); zonder engine: huidig gedrag |
| 2 | fail-closed-schakelaar: met engine geïnjecteerd **moet** status APPROVED zijn vóór dispatch | productie = altijd engine; geen bypass |
| 3 | V2-velden (toolId/argumentsHash/expiresAt) zodra TASK 6-implementatie landt | binding aangescherpt; actie-status "APPROVED" wordt écht gezet |
| 4 | `EmployeePermission`-shim uit TASK 15 ongemoeid | — |

- Geen database-migratie: approvals zijn in-memory (persistentie is TASK 24/25-optie); session-steps/summary-velden bestaan al.
- Bestaande `approveAction`-signature blijft; `input` krijgt `approver` (verplicht met engine).

## 9. Security

- ApprovalEngine-preventies (self-approval, AgentId-approver, PENDING-only transitions) gelden nu óók voor de employee — geen eigen goedkeuringslaag meer.
- Approval geldt alleen voor exact deze actie (binding §5); geen blanket approvals.
- Audit: approvalId + events (create/approve/reject/expire) + session-steps; **nooit** body, credentials of argumentwaarden — alleen `argumentsHash` (V2).
- Reject = STOP: dezelfde actie kan niet opnieuw worden aangevraagd binnen de sessie (engine-status is definitief).
- Tenancy: approval draagt `tenantId` (V2) en de sessie-poort checkt de sessie zelf; cross-tenant-approval is onmogelijk (approvalId is sessiegebonden).

## 10. Voorgestelde bestanden (implementatie later)

- `apps/web/lib/autonomous-employee/orchestrator.ts` — approval-aanmaak bij draft + `approver`-doorgave in approve/reject
- `apps/web/lib/autonomous-employee/approval-adapter.ts` — toewijzing §3 + TTL-check + idempotente createApproval
- `apps/web/lib/autonomous-employee/types.ts` — `approver` op `ApproveActionInput`; `approvalId` op `OutreachActionRecord`
- `apps/web/test/employee-approval.test.ts` — testmatrix §11

## 11. Testmatrix (FASE 18)

approve → dispatch (SENT) · approve → dispatcher BLOCKED · reject → REJECTED + géén dispatch · dubbel approve → geweigerd · approve na reject → geweigerd · TTL verstreken → EXPIRED + geen dispatch · onbekende approvalId → DENY · self-approval (approver = agent) → DENY · AgentId-approver → DENY · actie niet pending → weigeren · sessie niet WAITING_APPROVAL → weigeren · approvalId in session-steps + audit · body/credentials nooit in audit · binding mismatch (V2) → DENY · budget-klok stil tijdens WAITING_APPROVAL · concurrente approvals (verschillende acties, unieke id's) · bestaande employee-tests blijven groen (engine optioneel).

## 12. Consequenties

- TASK 19 (email_send-tool): gebruikt deze approval-flow als de tool-implementatie (approval → dispatcher).
- TASK 24 (observability): `approval_pending_total`/`approval_rejected_total` uit engine-events + session-steps.
- TASK 25 (tenant-policies): `resolveApprovalRequirement` kan MEDIUM-writes per tenant ook approvalplichtig maken — de employee gebruikt dan dezelfde poort.
- TASK 26 (e2e): run → WAITING_APPROVAL → approve → SENT is de centrale e2e-case.
