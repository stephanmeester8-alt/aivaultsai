# Agent Tool Platform — Calendar Read-Only Tool (TASK 22)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de CRM write-tools (TASK 21).
> Doel: `calendar_read` formaliseren als centrale ToolSpec + adapter over de **bestaande** booking-laag (`CalendarProvider.getAvailability`) — geen herbouw, geen inventie. De tool is read-only: `createAppointment`/`cancelAppointment` blijven buiten bereik (writes/cancel volgen in TASK 23 met approval).

---

## 1. Uitgangspunt: bestaande situatie (FACT)

```ts
// apps/web/lib/booking/types.ts  (geverifieerd)
CalendarProvider {
  getAvailability(request: AvailabilityRequest): Promise<AvailabilityResult>;
  createAppointment(request: CreateAppointmentRequest): Promise<CreatedAppointment>;
  cancelAppointment(externalCalendarEventId: string): Promise<void>;
}
AvailabilityResult { available, slots: AvailabilitySlot[], provider, reason? }
  // "False when no real calendar provider is connected."

// apps/web/lib/booking/provider-factory.ts  (geverifieerd)
createProductionCalendarProvider()
  CALENDAR_PROVIDER env: undefined/"unavailable"/"none" → UnavailableCalendarProvider
    (geen slots, geen appointments; "MUST NOT invent slots")
  configured-maar-niet-geïmplementeerd → throw (luide fout, nooit stille fallback)

// apps/web/lib/booking/service.ts + providers/unavailable-calendar-provider.ts
// migratie 001: appointments-tabel + external_calendar_event_id;
// "Availability must come from a real calendar integration."
```

- TASK 2-matrix (regel 85, geverifieerd): `calendar_read` = READ | **LOW** | geen approval | `CALENDAR_READ` | **I-P** ("booking service (availability)") | **formaliseren**.
- TASK 4: `CALENDAR_READ` (READ/LOW) ontworpen, **nog niet** in `PERMISSIONS`.

**Gevolg (FACT):** de read-capaciteit bestaat al (availability via injectable provider, fail-closed default). Deze taak **formaliseert** het als centrale tool — de matrix-status I-P wordt P; de `provider-factory.ts`-commentaar verwijst er zelf al naar ("Production calendar provider selection (TASK 22)").

## 2. Doel & principe

```text
AGENT → REGISTRY (calendar_read, enabled)
  → INPUT VALIDATION (bounded window + duration + timezone)
  → POLICY (CALENDAR_READ — centrale PERMISSIONS)
  → EXECUTION GATE (enabled ∧ adapter ∧ valid)
  → CALENDAR-ADAPTER (HERGEBRUIK CalendarProvider.getAvailability via injectable provider)
  → BOUNDED OUTPUT (slots ≤ 50, window ≤ 14 dagen)
  → EVIDENCE (windowHash, slotsCount, provider — nooit contactdata)
```

- **Hergebruik, geen herbouw** (REGEL 2): de adapter roept de bestaande `getAvailability` aan; `BookingService`/appointments-persistentie blijven ongemoeid.
- **Read-only is structureel:** de adapter exposeert alleen availability — `createAppointment`/`cancelAppointment` zijn niet bereikbaar (geen pad); die horen bij TASK 23 (write/cancel met approval).
- **Geen inventie:** een niet-gekoppelde provider retourneert `available: false` + `reason` (bestaand fail-closed gedrag); de tool verzint nooit slots.

## 3. ToolSpec (copy-ready, centrale catalogus)

```ts
const CALENDAR_READ: ToolSpec = {
  id: "calendar_read",
  name: "Calendar Read",
  description:
    "Lees beschikbaarheid (slots) via de gekoppelde calendar-provider. " +
    "Read-only: maakt nooit afspraken en annuleert niets. Zonder gekoppelde " +
    "provider: available=false (geen slots worden verzonnen).",
  version: "1.0.0",
  category: "CALENDAR",
  inputSchema: {
    type: "object",
    properties: {
      startDate:       { type: "string" },               // ISO-datum (YYYY-MM-DD)
      endDate:         { type: "string" },               // ≤ startDate + 14 dagen
      timezone:        { type: "string", maxLength: 64 },// IANA-naam, bv. "Europe/Amsterdam"
      durationMinutes: { type: "integer", minimum: 15, maximum: 240 },
    },
    required: ["startDate", "endDate", "timezone", "durationMinutes"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      available: { type: "boolean" },
      slots: {
        type: "array",
        maxItems: 50,                                    // bounded — nooit een onbeperkte lijst
        items: {
          type: "object",
          properties: {
            start: { type: "string" },
            end: { type: "string" },
            timezone: { type: "string" },
          },
          required: ["start", "end", "timezone"],
        },
      },
      provider: { type: "string" },
      reason: { type: ["string", "null"], maxLength: 200 },
    },
    required: ["available", "slots", "provider", "reason"],
  },
  permissions: ["CALENDAR_READ"],
  class: "READ",
  riskLevel: "LOW",                                      // matrix: LOW — laagste risico van de catalogus
  requiresApproval: false,
  enabled: true,                                         // adapter ontbreekt → NOT_IMPLEMENTED
  adapter: "calendar",
  tenantPolicy: "TENANT",                                // TASK 25-hook
  auditEnabled: true,
  timeoutMs: 10_000,
  rateLimit: { max: 60, windowMs: 60_000 },
};
```

**Bounding-regels (adapter):** `endDate − startDate` ≤ 14 dagen (anders DENY — geen paginatie-loops); `slots` max 50 (afkappen + `truncated`-notitie in `reason` is niet nodig: provider levert bounded of de adapter kapt bij 50 met `reason: "slots truncated"` en `available` blijft correct).

## 4. Adapter (`apps/web/lib/tool-registry/adapters/calendar.ts`)

```ts
async function executeCalendarRead(input, ctx): Promise<ToolResult> {
  // 1. schema-validatie (fail-closed; additionalProperties: false)
  // 2. window-check: endDate − startDate ≤ 14 dagen; ongeldige datum/timezone → DENY
  // 3. permission-check: CALENDAR_READ via PolicyEngine
  // 4. provider: ctx.calendarProvider ?? createProductionCalendarProvider()  // bestaande factory
  //    - UnavailableCalendarProvider → { available: false, reason } (bestaand; geen inventie)
  //    - factory throw (configured-maar-niet-geïmplementeerd) → gecontroleerde fout,
  //      geen ongecontroleerde retry (REGEL 5)
  // 5. result = await provider.getAvailability({ startDate, endDate, timezone, durationMinutes })
  // 6. bounding: slots.slice(0, 50)
  // 7. evidence: { windowHash: sha256(startDate|endDate|timezone|durationMinutes),
  //               slotsCount, provider } — nooit contactdata of agenda-inhoud
}
```

- `ctx.calendarProvider` is injecteerbaar (testen met fake slots; productie gebruikt de bestaande factory — geen vendor-key in code).
- De read-adapter heeft **geen** toegang tot `createAppointment`/`cancelAppointment`: die methoden zitten op het provider-contract maar worden door deze adapter niet aangeroepen en niet geëxposeerd.

## 5. Fail-closed tabel

| Situatie | Uitkomst |
|---|---|
| `CALENDAR_READ` niet in agent-permissions | DENY (policy) |
| Tool disabled / adapter ontbreekt | DENY / NOT_IMPLEMENTED (gate) |
| Input ongeldig (missend veld, onbekend veld, slechte timezone/datum) | DENY (schema) |
| Window > 14 dagen | DENY (bounding) |
| Provider = unavailable (niet gekoppeld) | `available: false` + reason — **geen slots verzonnen** |
| Factory throw (configured maar niet geïmplementeerd) | gecontroleerde fout (luide fail), geen stille fallback |
| Slots > 50 | afkappen op 50 (bounding) |
| Client-fout / timeout | gecontroleerde fout; geen ongecontroleerde retry |

## 6. Security

- Availability is geen klantdata, maar de audit blijft PII-vrij: alleen `windowHash` + slotsCount + provider — nooit agenda-inhoud, namen of e-mails.
- Geen credentials: provider wordt geïnjecteerd/gekozen via `CALENDAR_PROVIDER` env (bestaand patroon); een echte provider-key (bv. Google) komt pas bij de provider-implementatie, in Vercel env + `.env.local` (gitignored).
- Read-only contract: geen pad naar appointment-create/cancel; de tool kan geen side effects veroorzaken.
- Tijdzone/datumvalidatie voorkomt misbruik van het venster (bv. jaar-query's).

## 7. Voorgestelde bestanden (implementatie later)

- `packages/agent-core/src/permissions/types.ts` — `CALENDAR_READ` in `PERMISSIONS` (additive; `CALENDAR_WRITE` pas in TASK 23)
- `apps/web/lib/tool-registry/tools.ts` — ToolSpec (§3)
- `apps/web/lib/tool-registry/adapters/calendar.ts` — adapter §4 (hergebruikt `booking/provider-factory.ts` + `booking/types.ts`)
- `apps/web/test/calendar-readonly-tool.test.ts` — testmatrix §8

## 8. Testmatrix (FASE 18)

valid window → slots (fake provider) · window > 14 dagen → DENY · ongeldige timezone/datum → DENY · onbekend veld → DENY · missing permission → DENY · disabled/missing adapter → DENY/NOT_IMPLEMENTED · unavailable provider → available:false + reason (geen slots) · factory throw → gecontroleerde fout · slots > 50 → afgekapt · audit: windowHash + slotsCount, geen agenda-inhoud · client-fout → geen auto-retry · concurrent calls · bestaande booking-tests groen (adapter optioneel injecteerbaar).

## 9. Consequenties

- TASK 23 (calendar write/cancel — approval): exposeert `createAppointment`/`cancelAppointment` via write-tools met approval-binding (TASK 21-patroon) + idempotentie (`external_calendar_event_id`); `CALENDAR_WRITE` in `PERMISSIONS`; cancel = HIGH + approval (matrix regel 87).
- TASK 25 (tenant): `tenantPolicy` per tenant.
- TASK 26 (e2e): calendar_read als read-route in de e2e-keten.
