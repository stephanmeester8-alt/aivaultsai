# Agent Tool Platform — Approval Integration Design (TASK 6)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de risk-classificatie (TASK 5).
> Uitgangspunt: de bestaande `ApprovalEngine`, `ruleRiskAndApproval` en de ExecutionGate blijven de kern; deze taak legt het integratie-ontwerp vast dat de gaps sluit (tweede ogen voor CRITICAL, agent max-risk, tenant-policy, scoping, TTL). Implementatie volgt taak-voor-taak.

---

## 1. Uitgangspunt: bestaande approval-laag (FACT)

`packages/agent-core` bevat vandaag:

```ts
ApprovalEngine (in-memory)
  createApproval(approval)  // verplicht PENDING; task + agent moeten bestaan
  approve(approvalId, approver) / reject(...) / expire(approvalId)
  // self-approval geweigerd (approver ≠ requestedBy; approver geen AgentId)
  // events: APPROVAL_CREATED/APPROVED/REJECTED/EXPIRED

ExecutionGate.execute(request)
  approvalId → haal approval; ongeldige id → DENY
  binding-checks: approval.taskId === request.taskId,
                  approval.requestedAction === request.requestedAction,
                  isApprovalRiskSufficient(approval.riskLevel, request.riskLevel)
  geen approval + HIGH/CRITICAL → "APPROVAL_REQUIRED"
  daarna pas evaluatePolicy (met approval) → ALLOW | DENY | APPROVAL_REQUIRED

PolicyEngine ruleRiskAndApproval
  approvalId-match, requestedBy-match, taskId-match, status (REJECTED→DENY,
  PENDING/EXPIRED→APPROVAL_REQUIRED), isApprovalRiskSufficient

Integratiepunten (FACT):
  orchestrator: APPROVAL_REQUIRED → createApproval("apr_{requestId}", …) + approve(requestId, approvalId, approver)
  employee:     approveAction (bestaande HITL-poort, apps/web/lib/autonomous-employee/orchestrator.ts)
  runtime:      buildRuntimeEngines bouwt ApprovalEngine (apps/web/lib/agent-runtime/runtime-adapter.ts)
  recorder:     approvalId wordt gepersisteerd in run-records (postgres-run-recorder)
```

## 2. Geconstateerde gaps (waarom uitbreiden)

| # | Gap | Risico vandaag |
|---|---|---|
| G1 | Approval bindt alleen aan `taskId` + `requestedAction` (string) — **geen** toolId/argument-binding | eenmaal goedgekeurde actie is herbruikbaar voor andere argumenten binnen dezelfde task |
| G2 | `expire()` is alleen expliciet; **geen TTL** | een PENDING-approval kan eindeloos geldig blijven |
| G3 | **Geen tweede ogen** voor CRITICAL | één mens kan een CRITICAL-actie (database_delete, deployment_production) goedkeuren |
| G4 | `AgentDefinition.riskLevel` wordt **niet afgedwongen** als max-risk | een MEDIUM-agent kan HIGH/CRITICAL aanvragen (TASK 5-gap) |
| G5 | Geen tenant-policy approval-hook | MEDIUM-writes kunnen per tenant geen approval vereisen (TASK 25-koppeling) |
| G6 | Engine is in-memory | restart verliest PENDING-approvals (persistentie: TASK 24/25-optie) |

## 3. Principe

Human-in-the-loop is **geen foutafhandeling** maar een first-class control layer (FASE 10):

```text
MODEL → TOOL REQUEST
  → REGISTRY (tool bestaat, enabled)
  → INPUT VALIDATION
  → POLICY (permissions, max_risk)
  → RISK
  → APPROVAL ENGINE (alleen indien vereist)
  → EXECUTION GATE (policy re-evaluatie met approval)
  → ADAPTER → EXECUTION
  → EVIDENCE / AUDIT
```

De approval **voegt** toe aan de policy: permission-fouten worden vóór approval afgehandeld — een agent kan nooit approval vragen voor iets wat hij niet mag. `APPROVED` betekent: een mens autoriseert **deze** tool-call (tool + argumenten + task + risk) — nooit een permanente machtiging.

## 4. Volledige approval-flow (ontwerp)

```text
1. Tool-call (agent) → gate → risk HIGH/CRITICAL of tenantPolicy=APPROVAL
2. Orchestrator/runtime: createApproval({
     approvalId: "apr_…", taskId, requestedBy, requestedAction,
     riskLevel, toolId, argumentsHash, tenantId,
     requiredApprovals: risk === CRITICAL ? 2 : 1,
     expiresAt: now + TTL })
   → status PENDING
3. UI toont (FASE 10): Agent · Goal · Tool · Action · Target ·
   Arguments · Risk · Expected consequence · Evidence ·
   [Approve] [Reject]
4. Mens beslist: approve()/reject()
   - requiredApprovals=1 → APPROVED
   - requiredApprovals=2 → PARTIALLY_APPROVED → tweede mens (≠ eerste) → APPROVED
5. Agent herhaalt de tool-call met approvalId
6. Gate + policy re-evaluatie: ALLE binding-checks (§7) + status APPROVED → ALLOW
7. Uitvoering → evidence/audit (approvalId in run-record)
```

Na **reject**: STOP — de actie mag niet worden uitgevoerd en niet opnieuw worden aangevraagd binnen dezelfde task (een nieuwe aanvraag vereist een nieuwe task/context).

## 5. Data-model uitbreiding (backwards compatible)

Bestaande `Approval`-velden blijven; **nieuwe velden zijn optioneel**:

```ts
interface ApprovalV2 extends Approval {
  toolId?: string;              // G1: tool-binding
  argumentsHash?: string;       // G1: argument-binding (SHA-256 over genormaliseerde args)
  tenantId?: string;            // G5: tenant-context
  requiredApprovals?: 1 | 2;    // G3: 2 = tweede ogen (CRITICAL default)
  approvals?: { approver: string; at: string }[]; // G3: deel-beslissingen
  expiresAt?: string;           // G2: TTL
}
```

Nieuwe status `PARTIALLY_APPROVED` (alleen bereikbaar bij `requiredApprovals: 2`):

```text
PENDING → PARTIALLY_APPROVED → APPROVED   (twee verschillende mensen)
PENDING → APPROVED                          (requiredApprovals: 1)
PENDING | PARTIALLY_APPROVED → REJECTED | EXPIRED
```

**Fail-closed:** `PARTIALLY_APPROVED` telt **niet** als goedgekeurd — policy en gate behandelen het als "nog niet voldoende" (APPROVAL_REQUIRED), en de tweede approver moet **verschillen** van de eerste (`approvals[0].approver ≠ approvals[1].approver`).

## 6. Agent max-risk-plafond (G4, sluit TASK 5-gap)

Nieuwe policy-regel vóór approval-aanvraag:

```ts
RISK_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }
ruleMaxRisk: RISK_RANK[request.riskLevel] > RISK_RANK[agent.riskLevel] → DENY
```

Voorbeeld: agent met `riskLevel: "MEDIUM"` mag géén HIGH/CRITICAL-request doen — **zonder** approval-aanvraag (fail-closed: er wordt geen approval gevraagd voor iets dat nooit mag). Een `HIGH`-agent mag wél HIGH (met approval) maar geen CRITICAL.

## 7. Scoping & binding (G1)

Een approval geldt **alleen** voor exact deze tool-call. De gate/policy vergelijkt bij elke check:

| Binding | Check |
|---|---|
| task | `approval.taskId === request.taskId` (bestaand) |
| action | `approval.requestedAction === request.requestedAction` (bestaand) |
| **tool** | `approval.toolId === request.toolId` (nieuw) |
| **argumenten** | `approval.argumentsHash === request.argumentsHash` (nieuw) |
| agent | `approval.requestedBy === agentId` (bestaand, via policy) |
| risk | `isApprovalRiskSufficient(approval.riskLevel, request.riskLevel)` (bestaand) |

Elke mismatch → DENY. **Geen** "blanket approvals", geen hergebruik van een approval voor een andere tool of andere argumenten binnen dezelfde task.

## 8. Tenant-policy approval (G5, mechanisme voor TASK 25)

ToolSpec.tenantPolicy = `APPROVAL` betekent: approval vereist **ook** voor MEDIUM-risico (bv. `email_send`-achtige writes per tenant). Interface:

```ts
resolveApprovalRequirement(tenantId, toolId, riskLevel)
  → { required: boolean; secondApproval: boolean }
// risk HIGH/CRITICAL → required: true (altijd)
// tenantPolicy APPROVAL + MEDIUM → required: true (per tenant, TASK 25-data)
// anders → required: false
```

De gate consumeert deze functie na de risk-check; implementatie van de data-laag volgt in TASK 25. Tot die tijd: `tenantPolicy` uit de registry is statisch (geen tenant-overrides actief).

## 9. TTL / expiry (G2)

- `expiresAt` wordt bij `createApproval` gezet (default: HIGH 15 min, CRITICAL 30 min, MEDIUM-tenant 60 min — configureerbaar per tool).
- De gate behandelt een PENDING-approval met `now > expiresAt` als `EXPIRED` → APPROVAL_REQUIRED / DENY (fail-closed, geen achtergrondtaak nodig in de kritieke pad).
- `expire()` (expliciet) blijft bestaan; automatische cleanup van oude records is optioneel onderdeel van TASK 24 (observability).

## 10. Fail-closed tabel

| Situatie | Beslissing |
|---|---|
| HIGH/CRITICAL zonder approvalId | APPROVAL_REQUIRED (bestaand) |
| Onbekend approvalId | DENY (bestaand) |
| `REJECTED` | DENY (bestaand) |
| `PENDING` / `EXPIRED` | APPROVAL_REQUIRED (bestaand) |
| `PARTIALLY_APPROVED` (nieuw) | APPROVAL_REQUIRED — tweede ogen ontbreekt |
| `APPROVED` maar binding mismatch (tool/args/task/action/agent) | DENY |
| Approval-risk < request-risk | DENY (bestaand) |
| Verlopen PENDING (TTL) | EXPIRED → APPROVAL_REQUIRED / DENY |
| Request-risk > agent max-risk | DENY vóór approval-aanvraag (G4) |
| Tenant-policy APPROVAL zonder approval | APPROVAL_REQUIRED (G5) |

## 11. Audit / evidence

- Approval-events (create/approve/reject/expire) blijven in-memory + worden gekoppeld aan run-records via `approvalId` (bestaand: postgres-run-recorder).
- Audit toont: approvalId, toolId, riskLevel, requiredApprovals, approver(s), beslissing, timestamp. **Nooit**: credentials, argumentwaarden die secrets bevatten (argumentsHash alleen).

## 12. Backwards compatibility & migratie

- Bestaande `Approval`-shape, ApprovalEngine, gate en policy blijven **ongewijzigd**; alle 239 agent-core tests blijven geldig.
- Nieuwe velden optioneel; `PARTIALLY_APPROVED` wordt alleen gebruikt bij `requiredApprovals: 2` (CRITICAL).
- Orkestrator/employee flows blijven werken: approval-aanmaak krijgt extra velden (toolId, argumentsHash) zonder gedragswijziging voor bestaande calls.
- Geen database-migratie in deze taak; persistentie van approvals is een latere keuze (TASK 24/25).

## 13. Integratiepunten (wijzigingen bij implementatie)

| Laag | Wijziging |
|---|---|
| ApprovalEngine | TTL bij create; multi-approval (requiredApprovals, PARTIALLY_APPROVED, approvals[]) |
| PolicyEngine | `ruleMaxRisk` (G4); `ruleApprovalBinding` (toolId/argumentsHash) |
| ExecutionGate | TTL-check; tenant-policy hook (G5) |
| Orchestrator | createApproval met toolId/argumentsHash/tenantId/requiredApprovals/expiresAt |
| Employee | `approveAction` blijft de HITL-poort; doorgave van nieuwe velden (TASK 17) |
| runtime-adapter | doorgeven van toolId/argumentsHash uit de tool-call-brug |
| Recorder | approvalId (bestaat); eventueel approval-status kolom (TASK 24) |
| Approval UI | nieuw (FASE 10): PENDING-kaart met Agent/Goal/Tool/Action/Target/Arguments/Risk/Consequence/Evidence/Approve/Reject |

## 14. Voorgestelde bestanden (implementatie later)

- `packages/agent-core/src/approvals/types.ts` — ApprovalV2-velden + `PARTIALLY_APPROVED`
- `packages/agent-core/src/approvals/engine.ts` — multi-approval + TTL
- `packages/agent-core/src/permissions/policy-rules.ts` — `ruleMaxRisk`, `ruleApprovalBinding`
- `packages/agent-core/test/approvals/` — testmatrix §15
- `apps/web/lib/approvals/` — resolveApprovalRequirement + UI-data (FASE 10)

## 15. Testmatrix (FASE 18-aanvulling, per implementatietaak)

valid approve → execute · approval required · approval rejected · approval expired (TTL) · second approval required (CRITICAL) · second approver = eerste → DENY · binding mismatch (tool/args) → DENY · insufficient risk → DENY · max_risk overschreden → DENY zonder approval-request · self-approval → DENY · tenant APPROVAL zonder approval → APPROVAL_REQUIRED · approvalId in audit · secrets niet gelogd.

## 16. Consequenties voor volgende taken

- TASK 7 (tool-discovery): tools met `requiresApproval` worden gemarkeerd in de discovery-output.
- TASK 17 (employee approval-integratie): employee `approveAction` koppelt aan deze flow.
- TASK 19/21/23 (email_send, CRM-write, calendar-write): eerste concrete tools die deze approval-flow gebruiken.
- TASK 25 (tenant-policies): implementeert de `resolveApprovalRequirement`-data-laag.
