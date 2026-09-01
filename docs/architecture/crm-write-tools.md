# Agent Tool Platform — CRM Write Tools (TASK 21)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de CRM read-only-tools (TASK 20).
> Doel: de write-kant van CRM — centrale **`contact_create`**, **`contact_update`**, **`lead_create`** en **`lead_update`** met **verplichte approval** (TASK 17-flow) en een apart write-contract (`CrmWriteClient`) met idempotentie. Geen delete-tools in deze taak (DESTRUCTIVE/CRITICAL blijven buiten scope).

---

## 1. Uitgangspunt: bestaande situatie (FACT)

```text
TASK 2-matrix (regel 81, geverifieerd):
  contact_create / contact_update / lead_create / lead_update
    WRITE | MEDIUM–HIGH | approval: tenant-policy | CRM_WRITE | P (planned)
```

- TASK 20: `CrmClient` is **read-only** (searchContacts/getLead, geen write-methoden) — writes krijgen een eigen contract zodat read-only structureel blijft.
- TASK 4: `CRM_WRITE` (WRITE, MEDIUM–HIGH) ontworpen, **nog niet** in `PERMISSIONS`.
- TASK 19-patroon (email_send): approval vóór (APPROVED + binding + TTL), idempotente claim, tweede gate erna. TASK 17: ApprovalEngine-flow (`approvalId`, binding, TTL); TASK 6: V2-velden (toolId/argumentsHash).
- Risk-classificatie (TASK 5): "bij twijfel hoogste waarde" — CRM writes zijn externe side effects op klantdata.

**Gevolg (FACT):** writes zijn de eerste MEDIUM-risico tools die tóch approvalplichtig worden. Omdat tenant-policy-approval pas in TASK 25 bestaat, is **`requiresApproval: true` de fail-closed default tot dan**; TASK 25 kan per tenant versoepelen (tenzij de tool HIGH blijft).

## 2. Doel & principe

```text
AGENT → REGISTRY (contact_create | contact_update | lead_create | lead_update)
  → INPUT VALIDATION (bounded payload; additionalProperties: false)
  → POLICY (CRM_WRITE — centrale PERMISSIONS)
  → APPROVAL-CHECK (TASK 17-flow): bestaat + APPROVED + binding (toolId + argumentsHash) + TTL
  → ADAPTER (CrmWriteClient; tenantId + idempotencyKey verplicht)
  → EVIDENCE (approvalId, key-hash, resultaat-id — nooit payload)
```

- **Approval bindt aan exact deze write** (tool + genormaliseerde payload-hash): geen blanket approval, geen hergebruik voor andere records.
- **Read-only blijft structureel:** `CrmClient` (TASK 20) wordt niet uitgebreid; writes gaan uitsluitend via `CrmWriteClient` achter write-tools.
- **Idempotentie is contract-eis** (zoals `EmailProvider`/dispatcher-key): dezelfde write twee keer uitvoeren mag geen dubbel record geven.

## 3. ToolSpecs (copy-ready, centrale catalogus)

```ts
// Gemeenschappelijke kenmerken; per tool alleen de payload verschilt.
const CRM_WRITE_BASE = {
  category: "CRM",
  class: "WRITE",
  riskLevel: "MEDIUM",                 // matrix MEDIUM–HIGH; TASK 5: bij twijfel hoogste → MEDIUM+approval
  requiresApproval: true,              // fail-closed default tot TASK 25 (tenant-policy)
  enabled: true,                       // adapter ontbreekt → NOT_IMPLEMENTED
  adapter: "crm-write",
  tenantPolicy: "APPROVAL",            // TASK 25-hook
  auditEnabled: true,
  timeoutMs: 10_000,
  rateLimit: { max: 30, windowMs: 60_000 },   // writes zijn schaarser dan reads
};

const CONTACT_CREATE: ToolSpec = {
  ...CRM_WRITE_BASE,
  id: "contact_create",
  name: "Contact Create",
  description: "Maak een CRM-contact aan (approval verplicht, idempotent via dedupe-key).",
  version: "1.0.0",
  inputSchema: {
    type: "object",
    properties: {
      name:    { type: "string", minLength: 1, maxLength: 200 },
      email:   { type: "string", minLength: 3, maxLength: 320 },
      company: { type: "string", maxLength: 200 },
      role:    { type: "string", maxLength: 120 },
      dedupeKey: { type: "string", maxLength: 200 },   // bv. email+company-hash van de caller
    },
    required: ["name", "email", "dedupeKey"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      contactId: { type: "string" },
      created: { type: "boolean" },          // false = bestond al (idempotent)
    },
    required: ["contactId", "created"],
  },
  permissions: ["CRM_WRITE"],
};

// contact_update: id + gewijzigde velden (required: ["contactId", "dedupeKey"]; minstens één veld via anyOf)
// lead_create:   company + status? + dedupeKey (required: ["company", "dedupeKey"])
// lead_update:   leadId + velden (required: ["leadId", "dedupeKey"])
```

- `dedupeKey` is **verplicht** (fail-closed): zonder stabiele key kan idempotentie niet worden gegarandeerd → DENY.
- Update-tools mogen geen velden wissen (geen `null`-payloads via schema: lege string/ontbrekend veld = niet wijzigen).

## 4. CrmWriteClient-contract (apart van CrmClient)

```ts
// apps/web/lib/crm/write-client.ts — read-only CrmClient (TASK 20) blijft ongemoeid
interface CrmWriteClient {
  createContact(
    input: { name: string; email: string; company?: string; role?: string; idempotencyKey: string },
    ctx: { tenantId: string },
  ): Promise<{ contactId: string; created: boolean }>;
  updateContact(
    input: { contactId: string; changes: { name?: string; email?: string; company?: string; role?: string }; idempotencyKey: string },
    ctx: { tenantId: string },
  ): Promise<{ contactId: string }>;
  createLead(
    input: { company: string; status?: string; idempotencyKey: string },
    ctx: { tenantId: string },
  ): Promise<{ leadId: string; created: boolean }>;
  updateLead(
    input: { leadId: string; changes: { company?: string; status?: string }; idempotencyKey: string },
    ctx: { tenantId: string },
  ): Promise<{ leadId: string }>;
}
```

- **Idempotentie:** de adapter berekent `idempotencyKey = sha256({ toolId, tenantId, genormaliseerde payload })`; de client **moet** de key respecteren (contract-eis: zelfde key → zelfde record, `created: false` bij bestaand). Testmatrix dwingt dit af met een fake client.
- **Geen delete/merge/import** in dit contract: DESTRUCTIVE-bewerkingen zijn CRITICAL en blijven buiten scope (REGEL 4: model mag nooit direct wissen).

## 5. Approval-binding (TASK 17/19-patroon)

| Check | Regel |
|---|---|
| approval bestaat | `engine.getApproval(approvalId)` — onbekend → DENY |
| status | **APPROVED** vereist (PENDING/REJECTED/EXPIRED/PARTIALLY_APPROVED → DENY) |
| TTL | `now > expiresAt` → EXPIRED → DENY |
| binding (huidig) | `requestedAction === "crm_write:{toolId}"` |
| binding (V2, na TASK 6) | `toolId`-match ∧ `argumentsHash === sha256(payload)` — exact deze write |
| self-approval | engine weigert (human identity, approver ≠ requestedBy) |

- De approval wordt **vóór** de adapter gecontroleerd; daarna draait de client met de goedgekeurde payload (payload kan niet meer wijzigen tussen approval en uitvoering — argumentsHash-binding is de garantie, V2; huidige shape: payload-hash in `requestedAction`-suffix als tussenoplossing).

## 6. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| `CRM_WRITE` niet in agent-permissions | DENY (policy) |
| Tool disabled / adapter ontbreekt | DENY / NOT_IMPLEMENTED |
| Payload ongeldig (missend veld, onbekend veld, > bounds) | DENY (schema) |
| `dedupeKey` ontbreekt | DENY (idempotentie onmogelijk) |
| Approval ontbreekt / PENDING / REJECTED / EXPIRED | DENY |
| Binding mismatch (andere tool/payload) | DENY |
| `tenantId` ontbreekt | DENY |
| Client-fout / timeout | gecontroleerde fout; geen ongecontroleerde retry (REGEL 5) |
| Delete/merge-poging | onmogelijk: geen delete-methoden in het contract |

## 7. Security

- Approval bindt aan exact deze write (payload-hash); reject = definitief STOP (engine-status); TTL voorkomt eeuwige geldigheid.
- Audit: `approvalId`, `idempotencyKey`-hash, resultaat-id, count — **nooit** de payload (namen/e-mails zijn PII) of credentials.
- Tenancy: `tenantId` in elke call; write buiten de tenant is onmogelijk (contract + tests).
- Geen DESTRUCTIVE-capaciteit: het contract heeft geen delete; CRM-opschoning blijft een handmatige operator-taak.

## 8. Voorgestelde bestanden (implementatie later)

- `packages/agent-core/src/permissions/types.ts` — `CRM_WRITE` in `PERMISSIONS` (additive)
- `apps/web/lib/crm/write-client.ts` — `CrmWriteClient` (§4)
- `apps/web/lib/tool-registry/tools.ts` — 4 ToolSpecs (§3)
- `apps/web/lib/tool-registry/adapters/crm-write.ts` — approval-check (§5) + idempotencyKey + client-call
- `apps/web/test/crm-write-tools.test.ts` — testmatrix §9

## 9. Testmatrix (FASE 18)

valid create → contactId + created:true · idempotent herhaal (zelfde key) → created:false, geen dubbel record · update met velden → gewijzigd · update zonder velden → DENY · dedupeKey ontbreekt → DENY · payload > bounds / onbekend veld → DENY · missing permission → DENY · disabled/missing adapter → DENY/NOT_IMPLEMENTED · approval ontbreekt → DENY · approval PENDING/REJECTED/EXPIRED → DENY · binding mismatch (andere payload) → DENY · tenantId ontbreekt → DENY · client-fout → gecontroleerd, geen auto-retry · audit: approvalId + key-hash, nooit payload · concurrente writes zelfde key → één record · bestaande tests groen (write-client optioneel injecteerbaar).

## 10. Consequenties

- TASK 23 (calendar write — approval): zelfde patroon (approval-binding + idempotentie + apart write-contract).
- TASK 25 (tenant): `tenantPolicy: "APPROVAL"` kan per tenant worden aangepast; `requiresApproval: true` blijft de default.
- TASK 26 (e2e): approval → create → read-back (contact_search) als write/read-e2e-route.
