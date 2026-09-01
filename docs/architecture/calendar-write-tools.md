# Agent Tool Platform — Calendar Write Tools (TASK 23)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de calendar read-only-tool (TASK 22).
> Doel: de write-kant van calendar — centrale **`calendar_create`**, **`calendar_update`** en **`calendar_cancel`** met **verplichte approval** (TASK 17-flow), idempotentie via `appointmentId`/`external_calendar_event_id`, en hergebruik van de bestaande booking-laag. `calendar_cancel` is HIGH → approval altijd (matrix).

---

## 1. Uitgangspunt: bestaande situatie (FACT)

```ts
// apps/web/lib/booking/types.ts  (geverifieerd, TASK 22)
CalendarProvider {
  getAvailability(request)                        // read — TASK 22
  createAppointment(request: CreateAppointmentRequest): Promise<CreatedAppointment>
  cancelAppointment(externalCalendarEventId: string): Promise<void>
}
CreateAppointmentRequest { leadId, conversationId, start, end, timezone,
                           contactMethod: "phone"|"video"|"in_person", name?, email?, phone?, notes? }
CreatedAppointment  { appointmentId, status: BookingStatus, start, end, timezone,
                      externalCalendarEventId }
// migratie 001: appointments-tabel met external_calendar_event_id; BookingStatus:
// REQUESTED | CONFIRMED | CANCELLED | FAILED
```

- TASK 2-matrix (regels 86–87, geverifieerd):
  - `calendar_create` / `calendar_update`: WRITE | MEDIUM–HIGH | approval: **tenant-policy** | `CALENDAR_WRITE` | P
  - `calendar_cancel`: WRITE | **HIGH** | approval: **Ja** | `CALENDAR_WRITE` | P
- TASK 4: `CALENDAR_WRITE` (WRITE, MEDIUM–HIGH, create/update/cancel) ontworpen, **nog niet** in `PERMISSIONS`.
- TASK 21-patroon (CRM write): approval vóór (APPROVED + binding + TTL), verplichte `dedupeKey` (idempotentie), apart write-contract, geen DESTRUCTIVE.
- **Gap (FACT):** het bestaande `CalendarProvider`-contract heeft **geen update-methode** — `calendar_update` vereist een contract-uitbreiding (`CalendarWriteClient`, §4); create/cancel hergebruiken de bestaande methoden.

## 2. Doel & principe

```text
AGENT → REGISTRY (calendar_create | calendar_update | calendar_cancel)
  → INPUT VALIDATION (bounded; additionalProperties: false; dedupeKey verplicht)
  → POLICY (CALENDAR_WRITE — centrale PERMISSIONS)
  → APPROVAL-CHECK (TASK 17-flow): APPROVED + binding (toolId + argumentsHash) + TTL
     - cancel = HIGH → approval ALTIJD (engine)
     - create/update = MEDIUM → requiresApproval: true (fail-closed default tot TASK 25)
  → WRITE-ADAPTER (CalendarWriteClient; tenantId + idempotencyKey verplicht)
  → EVIDENCE (approvalId, key-hash, appointmentId — nooit contactdata/notities)
```

- **Approval bindt aan exact deze write** (payload-hash): geen blanket approval; payload kan niet wijzigen tussen approval en uitvoering (V2-garantie, TASK 6).
- **Cancel is definitief en hoog-risico:** alleen `REQUESTED`/`CONFIRMED` → `CANCELLED`; dubbel cancel → DENY (geen tweede side effect).
- **Read-only (TASK 22) blijft structureel:** `calendar_read` raakt deze write-tools niet en vice versa.

## 3. ToolSpecs (copy-ready, centrale catalogus)

```ts
const CALENDAR_WRITE_BASE = {
  category: "CALENDAR",
  class: "WRITE",
  requiresApproval: true,               // cancel: HIGH (altijd); create/update: fail-closed default tot TASK 25
  enabled: true,                        // adapter ontbreekt → NOT_IMPLEMENTED
  adapter: "calendar-write",
  tenantPolicy: "APPROVAL",             // TASK 25-hook
  auditEnabled: true,
  timeoutMs: 10_000,
  rateLimit: { max: 20, windowMs: 60_000 },
};

const CALENDAR_CREATE: ToolSpec = {
  ...CALENDAR_WRITE_BASE,
  id: "calendar_create",
  name: "Calendar Create",
  description: "Maak een afspraak via de gekoppelde calendar-provider (approval verplicht, idempotent).",
  version: "1.0.0",
  riskLevel: "MEDIUM",
  inputSchema: {
    type: "object",
    properties: {
      start:           { type: "string" },                 // ISO-timestamp
      end:             { type: "string" },
      timezone:        { type: "string", maxLength: 64 },
      contactMethod:   { enum: ["phone", "video", "in_person"] },
      leadId:          { type: "string", maxLength: 200 },
      conversationId:  { type: "string", maxLength: 200 },
      name:            { type: "string", maxLength: 200 },
      email:           { type: "string", maxLength: 320 },
      notes:           { type: "string", maxLength: 2000 },  // alleen voor de provider; NIET in audit
      dedupeKey:       { type: "string", maxLength: 200 },
    },
    required: ["start", "end", "timezone", "contactMethod", "dedupeKey"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      appointmentId: { type: "string" },
      status: { enum: ["REQUESTED", "CONFIRMED", "CANCELLED", "FAILED"] },
      externalCalendarEventId: { type: "string" },
      created: { type: "boolean" },          // false = bestond al (idempotent)
    },
    required: ["appointmentId", "status", "externalCalendarEventId", "created"],
  },
  permissions: ["CALENDAR_WRITE"],
};

// CALENDAR_UPDATE: id: "calendar_update" — input { appointmentId (verplicht),
//   start?/end?/timezone?/contactMethod? (anyOf: minstens één), dedupeKey (verplicht) }
//   riskLevel: "MEDIUM"; output { appointmentId, status, externalCalendarEventId }
// CALENDAR_CANCEL: id: "calendar_cancel" — input { appointmentId (verplicht),
//   reason? (maxLength 200), dedupeKey (verplicht) }
//   riskLevel: "HIGH"; requiresApproval: true (altijd); output { appointmentId, status: "CANCELLED" }
```

- **`dedupeKey` verplicht overal** (fail-closed): zonder stabiele key geen idempotentie-garantie → DENY.
- `notes` wordt door de adapter doorgegeven aan de provider maar **nooit** naar audit/evidence (privé-data).

## 4. CalendarWriteClient-contract

```ts
// apps/web/lib/calendar/write-client.ts
// HERGEBRUIKT de bestaande CalendarProvider-methoden; vult alleen de update-gap.
interface CalendarWriteClient {
  createAppointment(input: CreateAppointmentRequest & { idempotencyKey: string },
                    ctx: { tenantId: string }): Promise<CreatedAppointment & { created: boolean }>;
  updateAppointment(                                  // NIEUW — bestaat niet in CalendarProvider
    input: { appointmentId: string;
             changes: { start?: string; end?: string; timezone?: string; contactMethod?: "phone"|"video"|"in_person" };
             idempotencyKey: string },
    ctx: { tenantId: string },
  ): Promise<{ appointmentId: string; status: BookingStatus; externalCalendarEventId: string }>;
  cancelAppointment(
    input: { appointmentId: string; reason?: string; idempotencyKey: string },
    ctx: { tenantId: string },
  ): Promise<{ appointmentId: string; status: "CANCELLED" }>;
}
```

- **Update-gap expliciet:** het bestaande `CalendarProvider`-contract wordt niet aangepast; `updateAppointment` is een contract-eis voor de (toekomstige) provider-implementatie (bv. Google Calendar `events.patch`). Tot die provider bestaat: `calendar_update` → NOT_IMPLEMENTED (fail-closed, geen simulatie).
- **Idempotentie:** `idempotencyKey = sha256({ toolId, tenantId, genormaliseerde payload })`; de client respecteert de key (contract + testmatrix). Voor cancel: de lokale `appointments`-tabel (migratie 001) is de state-bron — status-overgang `REQUESTED|CONFIRMED → CANCELLED` via conditional UPDATE (net als de email_send-claim, TASK 19): dubbel cancel → 0 rijen → DENY.

## 5. Approval-binding (TASK 17/19/21-patroon)

| Check | Regel |
|---|---|
| approval bestaat | `engine.getApproval(approvalId)` — onbekend → DENY |
| status | **APPROVED** vereist (PENDING/REJECTED/EXPIRED/PARTIALLY_APPROVED → DENY) |
| TTL | `now > expiresAt` → EXPIRED → DENY |
| binding (huidig) | `requestedAction === "calendar_write:{toolId}"` |
| binding (V2, na TASK 6) | `toolId`-match ∧ `argumentsHash === sha256(payload)` |
| self-approval | engine weigert (human identity) |
| cancel-extra | risk HIGH → engine vereist approval sowieso; `requiredApprovals: 1` (HIGH) |

## 6. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| `CALENDAR_WRITE` niet in agent-permissions | DENY (policy) |
| Tool disabled / adapter ontbreekt (incl. update zonder provider) | DENY / NOT_IMPLEMENTED |
| Payload ongeldig / onbekend veld / bounds | DENY (schema) |
| `dedupeKey` ontbreekt | DENY (idempotentie onmogelijk) |
| Approval ontbreekt / PENDING / REJECTED / EXPIRED | DENY (cancel: engine-verplicht, HIGH) |
| Binding mismatch (andere tool/payload) | DENY |
| Afspraak niet gevonden | DENY (`APPOINTMENT_NOT_FOUND`) |
| Dubbel cancel (al CANCELLED) | DENY (`ALREADY_CANCELLED`) — conditional update |
| `tenantId` ontbreekt | DENY |
| Provider-fout / timeout | gecontroleerde fout; geen ongecontroleerde retry (REGEL 5) |
| Delete/opschoning | onmogelijk: geen delete-methode in het contract |

## 7. Security

- Cancel = HIGH + approval altijd (matrix); create/update = MEDIUM + `requiresApproval: true` (fail-closed default tot TASK 25).
- Audit: `approvalId`, `idempotencyKey`-hash, `appointmentId`, status — **nooit** `notes`, namen, e-mails of agenda-inhoud.
- Idempotentie via key + lokale status-overgang: geen dubbele afspraken, geen dubbele annuleringen, ook bij concurrentie.
- Tenancy: `tenantId` per call; de appointments-tabel is tenant-gescoped (FK naar tenant, migratie 001-patroon).
- Geen DESTRUCTIVE: geen delete/opschoning van afspraken — annuleren is het enige "ongedaan maken" en dat is approval-plichtig.

## 8. Voorgestelde bestanden (implementatie later)

- `packages/agent-core/src/permissions/types.ts` — `CALENDAR_WRITE` in `PERMISSIONS` (additive)
- `apps/web/lib/calendar/write-client.ts` — `CalendarWriteClient` (§4)
- `apps/web/lib/tool-registry/tools.ts` — 3 ToolSpecs (§3)
- `apps/web/lib/tool-registry/adapters/calendar-write.ts` — approval-check (§5) + idempotencyKey + status-overgangen
- `apps/web/test/calendar-write-tools.test.ts` — testmatrix §9

## 9. Testmatrix (FASE 18)

valid create → appointmentId + created:true · idempotent herhaal (zelfde key) → created:false · valid update (minstens één veld) → gewijzigd · update zonder velden → DENY · valid cancel (REQUESTED/CONFIRMED) → CANCELLED · dubbel cancel → DENY · cancel van niet-bestaande → DENY · dedupeKey ontbreekt → DENY · onbekend veld / bounds → DENY · missing permission → DENY · disabled/missing adapter → DENY/NOT_IMPLEMENTED · update zonder provider-implementatie → NOT_IMPLEMENTED · approval ontbreekt/PENDING/REJECTED/EXPIRED → DENY · binding mismatch → DENY · tenantId ontbreekt → DENY · audit: approvalId + key-hash + appointmentId, nooit notes/contactdata · concurrente cancels → één CANCELLED, rest DENY · bestaande booking-tests groen (write-client optioneel injecteerbaar).

## 10. Consequenties

- TASK 24 (observability): `tool_calls_total{calendar_*}` + `approval_rejected_total`.
- TASK 25 (tenant): `tenantPolicy: "APPROVAL"` per tenant; `requiresApproval: true` blijft default.
- TASK 26 (e2e): approval → calendar_create → calendar_read (slot weg) → cancel is de volledige calendar-keten.
