# Agent Tool Platform — Email Send Tool (TASK 19)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de email draft-tool (TASK 18).
> Doel: de centrale **`email_send`**-tool — de eerste tool met **verplichte menselijke approval**. De tool leest een draft uit `email_drafts` via `draftId`, vereist een **APPROVED**-approval (TASK 17-flow), en stuurt alleen via de bestaande fail-closed dispatcher. `enabled: false` in de catalogus: send staat **nooit** automatisch aan.

---

## 1. Uitgangspunt: bestaande situatie (FACT)

```ts
// apps/web/lib/prospect-run/email-dispatcher.ts  (geverifieerd)
dispatchEmail(request, provider)
  mode HUMAN_REVIEW → { status: "QUEUED", reason: "HITL_REVIEW_REQUIRED" }  // default deploy
  mode AUTO_SEND    → dispatchAllowed({ email, optedOut, warmedUp, rateAllowed, autoSendEnabled: true })
                      → BLOCKED (reden) | EMAIL_PROVIDER_NOT_CONFIGURED (geen provider/email)
                      → provider.send({ to, subject, text: body + "\n\n" + optOutLine,
                                        idempotencyKey: `${runId}:${recipientHash}` })
                      → SENT + providerMessageId
EmailProvider.send(...)  // injectable interface — geen vendor-key in code
```

- TASK 18: `email_drafts`-tabel (migratie 006) — `draft_id`, `tenant_id`, `session_id`, `action_id`, `to_address`, `subject`, `body`, `opt_out_line`, `status` (DRAFT/APPROVED/SENT/CANCELLED), unique (tenant, session, action); DB-check-constraints op lengtes.
- TASK 17: employee-approval door de ApprovalEngine — `apr_employee_{sessionId}_{actionId}`, PENDING → APPROVED/REJECTED/EXPIRED, TTL, `approveAction` als enige route; V2-velden (toolId/argumentsHash) na TASK 6-implementatie.
- TASK 15-mapping: `employee_email_send` (EXTERNAL_SIDE_EFFECT / HIGH / requiresApproval / **enabled: false** / adapter `email` / tenantPolicy APPROVAL / 15 s / 20 per uur).
- TASK 4-catalogus: `EMAIL_SEND` ontworpen, **nog niet** in de gesloten `PERMISSIONS`-union.

**Gevolg (FACT):** er is vandaag geen centrale send-tool — de employee bereikt de dispatcher alleen via `approveAction` (sessie-poort). TASK 19 maakt `email_send` centraal met dezelfde dubbele beveiliging: **approval vóór, dispatcher-gates erna**.

## 2. Doel & principe

```text
AGENT → REGISTRY (email_send; enabled=false → DENY tenzij expliciet aangezet)
  → INPUT VALIDATION ({ draftId, approvalId } — geen vrije tekst van het model)
  → POLICY (EMAIL_SEND — centrale PERMISSIONS)
  → APPROVAL-CHECK (TASK 17-flow): bestaat + APPROVED + binding (draftId) — anders DENY
  → DRAFT-CLAIM (idempotent, §5): DRAFT/APPROVED → SENT claim — anders DENY (al verstuurd)
  → DISPATCHER (bestaande gates: opt-out/warm-up/rate/provider) — BLOCKED mogelijk
  → SENT + providerMessageId → audit (recipientHash, nooit body/ruw adres)
```

- **Het model levert geen e-mailinhoud:** de tool accepteert alleen `draftId` + `approvalId`; subject/body komen uitsluitend uit `email_drafts` (aangemaakt door `email_draft`, TASK 18).
- **Approval is geen vrijbrief:** de dispatcher-gates draaien daarna altijd opnieuw (opt-out, warm-up, rate, provider-aanwezigheid).
- **`enabled: false`** in de catalogus; enablement is een expliciete deployment/tenant-beslissing (TASK 25-hook).

## 3. ToolSpec (copy-ready, centrale catalogus)

```ts
const EMAIL_SEND: ToolSpec = {
  id: "email_send",
  name: "Email Send",
  description:
    "Verstuur een goedgekeurde e-maildraft via de fail-closed dispatcher. " +
    "Vereist een APPROVED approval (TASK 17-flow) gebonden aan de draftId. " +
    "Default disabled: send staat nooit automatisch aan.",
  version: "1.0.0",
  category: "EMAIL",
  inputSchema: {
    type: "object",
    properties: {
      draftId:    { type: "string" },   // uit email_drafts (TASK 18)
      approvalId: { type: "string" },   // uit ApprovalEngine (TASK 17)
    },
    required: ["draftId", "approvalId"],
    additionalProperties: false,        // geen veldsmokkel (subject/body/to kunnen NIET worden meegegeven)
  },
  outputSchema: {
    type: "object",
    properties: {
      status: { enum: ["SENT", "BLOCKED"] },
      reason: { type: ["string", "null"] },
      providerMessageId: { type: ["string", "null"] },
    },
    required: ["status"],
  },
  permissions: ["EMAIL_SEND"],
  class: "EXTERNAL_SIDE_EFFECT",
  riskLevel: "HIGH",
  requiresApproval: true,
  enabled: false,                        // expliciete enablement vereist
  adapter: "email",
  tenantPolicy: "APPROVAL",
  auditEnabled: true,                    // verplicht voor EXTERNAL_SIDE_EFFECT
  timeoutMs: 15_000,
  rateLimit: { max: 20, windowMs: 3_600_000 },  // per tenant: max 20/uur
};
```

## 4. Approval-binding (TASK 17-koppeling)

| Check | Regel |
|---|---|
| approval bestaat | `engine.getApproval(approvalId)` — onbekend → DENY (`APPROVAL_NOT_FOUND`) |
| status | **APPROVED** vereist; PENDING/REJECTED/EXPIRED/PARTIALLY_APPROVED → DENY |
| TTL | `now > expiresAt` → behandelen als EXPIRED → DENY (fail-closed, geen achtergrondtaak) |
| binding (huidig) | `requestedAction === "email_send:{domain}"` van de draft |
| binding (V2, na TASK 6) | `toolId === "email_send"` ∧ `argumentsHash === sha256({ draftId, tenantId })` |
| self-approval | engine weigert al (approver ≠ requestedBy; human identity) |

- **Geen blanket approvals:** de approval is gebonden aan exact deze draft (en V2: exact deze argumenten); dezelfde approval kan geen andere draft versturen.
- `approveAction` (employee) en `rejectAction` blijven de **enige** beslissingspoorten; `email_send` **consumeert** de approval — het kan hem niet zelf aanmaken of goedkeuren.

## 5. Idempotente draft-claim (geen dubbele verstuur)

```sql
-- Claim vóór de provider-call: één van meerdere concurrente calls wint (distributed lock)
UPDATE email_drafts
   SET status = 'SENT'
 WHERE draft_id = ${draftId}::uuid
   AND tenant_id = ${tenantId}::uuid
   AND status IN ('DRAFT','APPROVED')
RETURNING draft_id;
-- 0 rijen → DENY (ALREADY_SENT of CANCELLED) — nooit een tweede provider-call
```

- Provider-call pas **na** de claim; `idempotencyKey = "email_send:{draftId}"` (dispatcher-interface).
- Provider-fout → status terug naar `DRAFT` (veilige, handmatige retry; geen ongecontroleerde automatische retry — REGEL 5).
- Status-overgang: `DRAFT → APPROVED (approval) → SENT (claim + provider)`; `CANCELLED` (reject/operator) → DENY.

## 6. Employee-koppeling (TASK 15-update)

| TASK 15-mapping | TASK 19-beslissing |
|---|---|
| `employee_email_send` (eigen tool) | **vervangen** door centrale `email_send`; blijft **buiten** `allowedTools` — alleen bereikbaar met `approvalId` uit de TASK 17-flow |
| `approveAction` | ongewijzigd: de enige route die een approval APPROVED maakt; daarna voert de centrale tool de send uit |
| `EMAIL_SEND` (ontwerp) | toegevoegd aan `PERMISSIONS` (agent-core) bij implementatie — additive |

## 7. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| Tool disabled (default) | DENY — send nooit automatisch |
| `EMAIL_SEND` niet in agent-permissions | DENY (policy) |
| Input zonder `draftId`/`approvalId` of onbekend veld | DENY (schema; `additionalProperties: false`) |
| Geen/verkeerde approvalId | DENY (`APPROVAL_NOT_FOUND` / binding mismatch) |
| Approval PENDING/REJECTED/EXPIRED/PARTIALLY_APPROVED | DENY |
| TTL verstreken | DENY (EXPIRED) |
| Draft niet gevonden / verkeerde tenant | DENY (FK + tenant-check) |
| Draft al SENT/CANCELLED | DENY (`ALREADY_SENT`) — claim is de lock |
| Dispatcher-gates (opt-out/warm-up/rate) | BLOCKED met reden — approval is géén vrijbrief |
| Provider ontbreekt | BLOCKED (`EMAIL_PROVIDER_NOT_CONFIGURED`) |
| Provider-fout na claim | status terug naar DRAFT; geen automatische retry |

## 8. Security

- **Model kan geen e-mailinhoud bepalen:** input is alleen `draftId` + `approvalId`; subject/body/to komen uit de DB (TASK 18-bounds: subject ≤ 200, body ≤ 5 000).
- PII-minimalisatie: audit bevat `recipientHash` (SHA-256) + `draftId` + `approvalId` + status + providerMessageId — **nooit** `to_address`, body of credentials.
- Idempotentie-claim = voorwaardelijke UPDATE (distributed lock): ook bij concurrente calls maximaal één provider-call.
- Tenancy: draft- en approval-binding dragen `tenantId`; cross-tenant send is onmogelijk (draft-lookup + approval zijn tenant-gescoped).
- Approval bindt aan exact deze draft; reject = definitief STOP (engine-status); TTL voorkomt eeuwige geldigheid.

## 9. Voorgestelde bestanden (implementatie later)

- `packages/agent-core/src/permissions/types.ts` — `EMAIL_SEND` in `PERMISSIONS` (additive)
- `apps/web/lib/tool-registry/tools.ts` — `EMAIL_SEND` ToolSpec (§3)
- `apps/web/lib/tool-registry/adapters/email-send.ts` — approval-check (§4) + claim (§5) + `dispatchEmail` (§1)
- `apps/web/lib/approvals/approval-check.ts` — gedeelde binding-check (V2-hook)
- `apps/web/test/email-send-tool.test.ts` — testmatrix §10

## 10. Testmatrix (FASE 18)

valid (approval APPROVED + draft DRAFT + gates ok) → SENT · approval ontbreekt → DENY · approval PENDING → DENY · approval REJECTED → DENY · approval EXPIRED (TTL) → DENY · binding mismatch (andere draft) → DENY · draft niet gevonden → DENY · verkeerde tenant → DENY · al SENT → DENY (geen tweede call) · disabled tool → DENY · missing permission → DENY · dispatcher BLOCKED (opt-out/warm-up/rate) · provider ontbreekt → BLOCKED · provider-fout → status terug naar DRAFT (geen auto-retry) · concurrente calls → één SENT, rest DENY · audit: recipientHash + approvalId, nooit body/ruw adres · body/subject niet model-leverbare velden (schema) · bestaande employee-tests groen (approveAction ongewijzigd).

## 11. Consequenties

- TASK 21/23 (CRM/calendar write): zelfde patroon — approval-binding op de tool + idempotente claim + tweede gate na approval.
- TASK 24 (observability): `tool_calls_total{email_send}`, `approval_rejected_total`, `external_requests`.
- TASK 25 (tenant): `enabled`/`tenantPolicy` per tenant bepaalt of `email_send` überhaupt bestaat.
- TASK 26 (e2e): draft → approval → send is de centrale e2e-keten.
