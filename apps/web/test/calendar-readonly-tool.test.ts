import assert from "node:assert/strict";
import { test } from "node:test";

import {
  executeCalendarRead,
  type CalendarReadDeps,
} from "../lib/tool-registry/adapters/calendar.ts";
import type { CalendarProvider } from "../lib/booking/types.ts";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

const VALID_INPUT = {
  startDate: "2026-09-01",
  endDate: "2026-09-07",
  timezone: "Europe/Amsterdam",
  durationMinutes: 30,
};

function makeProvider(overrides: Partial<CalendarProvider> = {}): CalendarProvider {
  return {
    getAvailability: async (request) => {
      assert.equal(request.timezone, "Europe/Amsterdam"); // contract: input komt door
      return {
        available: true,
        slots: [
          { start: "2026-09-01T09:00:00.000Z", end: "2026-09-01T09:30:00.000Z", timezone: "Europe/Amsterdam" },
          { start: "2026-09-01T10:00:00.000Z", end: "2026-09-01T10:30:00.000Z", timezone: "Europe/Amsterdam" },
        ],
        provider: "fake-calendar",
      };
    },
    // Read-only contract: write-paden zijn onbereikbaar — een aanroep zou crashen.
    createAppointment: async () => {
      throw new Error("createAppointment must never be reachable from calendar_read");
    },
    cancelAppointment: async () => {
      throw new Error("cancelAppointment must never be reachable from calendar_read");
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<CalendarReadDeps> = {}): CalendarReadDeps {
  return { provider: makeProvider(), tenantId: TENANT_ID, log: () => {}, ...overrides };
}

test("calendar read: valide venster → slots + PII-vrije audit", async () => {
  const result = await executeCalendarRead(VALID_INPUT, makeDeps());
  assert.equal(result.ok, true);
  assert.equal(result.value?.available, true);
  assert.equal(result.value?.slots.length, 2);
  assert.equal(result.value?.provider, "fake-calendar");
  assert.equal(result.value?.reason, null);
  assert.match(result.audit!.windowHash, /^[0-9a-f]{64}$/);
  assert.equal(result.audit?.slotsCount, 2);
  assert.equal(result.audit?.provider, "fake-calendar");
  // Audit bevat alleen windowHash/slotsCount/provider — nooit agenda-inhoud.
  assert.deepEqual(Object.keys(result.audit!).sort(), ["provider", "slotsCount", "windowHash"]);
});

test("calendar read: venster exact 14 dagen ok; 15 dagen → INVALID_WINDOW; end < start → INVALID_WINDOW", async () => {
  const deps = makeDeps();
  const exactly14 = await executeCalendarRead(
    { ...VALID_INPUT, endDate: "2026-09-15" },
    deps,
  );
  assert.equal(exactly14.ok, true);
  const over14 = await executeCalendarRead(
    { ...VALID_INPUT, endDate: "2026-09-16" },
    deps,
  );
  assert.equal(over14.error, "INVALID_WINDOW");
  const reversed = await executeCalendarRead(
    { ...VALID_INPUT, startDate: "2026-09-07", endDate: "2026-09-01" },
    deps,
  );
  assert.equal(reversed.error, "INVALID_WINDOW");
});

test("calendar read: ongeldige datum → DENY (rollover/format wordt afgewezen)", async () => {
  const deps = makeDeps();
  for (const startDate of ["2026-02-31", "2026-9-1", "01-09-2026", "2026/09/01", "2026-09-01T00:00:00Z"]) {
    const result = await executeCalendarRead({ ...VALID_INPUT, startDate }, deps);
    assert.equal(result.error, "INVALID_CALENDAR_INPUT", `startDate=${startDate}`);
  }
});

test("calendar read: ongeldige timezone → DENY", async () => {
  const deps = makeDeps();
  const tooLong = "Europe/Amsterdam-" + "x".repeat(60);
  for (const timezone of ["Amsterdam", "Nope/Amsterdam", "", " ", tooLong]) {
    const result = await executeCalendarRead({ ...VALID_INPUT, timezone }, deps);
    assert.equal(result.error, "INVALID_CALENDAR_INPUT", `timezone=${timezone}`);
  }
});

test("calendar read: durationMinutes buiten 15..240 of niet-integer → DENY", async () => {
  const deps = makeDeps();
  for (const durationMinutes of [10, 300, 30.5, 0, -5, "30", null]) {
    const input = { ...VALID_INPUT, durationMinutes };
    const result = await executeCalendarRead(input, deps);
    assert.equal(result.error, "INVALID_CALENDAR_INPUT", `durationMinutes=${String(durationMinutes)}`);
  }
  const missing = await executeCalendarRead(
    { startDate: VALID_INPUT.startDate, endDate: VALID_INPUT.endDate, timezone: VALID_INPUT.timezone },
    deps,
  );
  assert.equal(missing.error, "INVALID_CALENDAR_INPUT");
});

test("calendar read: onbekend veld / ontbrekend veld / niet-object → DENY", async () => {
  const deps = makeDeps();
  assert.equal((await executeCalendarRead({ ...VALID_INPUT, extra: 1 }, deps)).error, "INVALID_CALENDAR_INPUT");
  assert.equal((await executeCalendarRead({}, deps)).error, "INVALID_CALENDAR_INPUT");
  assert.equal((await executeCalendarRead("geen-object", deps)).error, "INVALID_CALENDAR_INPUT");
  assert.equal((await executeCalendarRead(null, deps)).error, "INVALID_CALENDAR_INPUT");
  const noTimezone = await executeCalendarRead(
    { startDate: VALID_INPUT.startDate, endDate: VALID_INPUT.endDate, durationMinutes: 30 },
    deps,
  );
  assert.equal(noTimezone.error, "INVALID_CALENDAR_INPUT");
});

test("calendar read: tenantId ontbreekt → DENY (geen globale calls)", async () => {
  const result = await executeCalendarRead(VALID_INPUT, { provider: makeProvider(), tenantId: "  " });
  assert.equal(result.ok, false);
  assert.equal(result.error, "TENANT_REQUIRED");
});

test("calendar read: niet-gekoppelde provider → available:false + reason, nooit verzonnen slots", async () => {
  const provider = makeProvider({
    getAvailability: async () => ({
      available: false,
      slots: [],
      provider: "unavailable",
      reason: "No calendar provider is connected",
    }),
  });
  const result = await executeCalendarRead(VALID_INPUT, makeDeps({ provider }));
  assert.equal(result.ok, true);
  assert.equal(result.value?.available, false);
  assert.equal(result.value?.slots.length, 0);
  assert.equal(result.value?.reason, "No calendar provider is connected");
  assert.equal(result.audit?.slotsCount, 0);
});

test("calendar read: provider-fout → gecontroleerde fout, geen auto-retry", async () => {
  let calls = 0;
  const provider = makeProvider({
    getAvailability: async () => {
      calls += 1;
      throw new Error("provider kapot");
    },
  });
  const result = await executeCalendarRead(VALID_INPUT, makeDeps({ provider }));
  assert.equal(result.ok, false);
  assert.equal(result.error, "CALENDAR_CLIENT_ERROR");
  assert.equal(calls, 1); // precies één poging — geen retry
});

test("calendar read: slots > 50 → afgekapt op 50 + reason 'slots truncated'", async () => {
  const slots = Array.from({ length: 73 }, (_, i) => ({
    start: `2026-09-01T${String(i).padStart(2, "0")}:00:00.000Z`,
    end: `2026-09-01T${String(i).padStart(2, "0")}:30:00.000Z`,
    timezone: "Europe/Amsterdam",
  }));
  const provider = makeProvider({
    getAvailability: async () => ({ available: true, slots, provider: "fake-calendar" }),
  });
  const result = await executeCalendarRead(VALID_INPUT, makeDeps({ provider }));
  assert.equal(result.ok, true);
  assert.equal(result.value?.slots.length, 50);
  assert.equal(result.value?.reason, "slots truncated");
  assert.equal(result.audit?.slotsCount, 50);
});

test("calendar read: windowHash is deterministisch en input-gebonden", async () => {
  const deps = makeDeps();
  const a1 = await executeCalendarRead(VALID_INPUT, deps);
  const a2 = await executeCalendarRead(VALID_INPUT, deps);
  assert.equal(a1.audit?.windowHash, a2.audit?.windowHash); // deterministisch
  const b = await executeCalendarRead({ ...VALID_INPUT, durationMinutes: 60 }, deps);
  assert.notEqual(a1.audit?.windowHash, b.audit?.windowHash); // input-gebonden
});

test("calendar read: concurrente calls zijn onafhankelijk", async () => {
  const slow = makeProvider({
    getAvailability: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        available: true,
        slots: [{ start: "2026-09-01T09:00:00.000Z", end: "2026-09-01T09:30:00.000Z", timezone: "Europe/Amsterdam" }],
        provider: "slow-calendar",
      };
    },
  });
  const deps = makeDeps({ provider: slow });
  const [first, second] = await Promise.all([
    executeCalendarRead(VALID_INPUT, deps),
    executeCalendarRead({ ...VALID_INPUT, durationMinutes: 60 }, deps),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value?.slots.length, 1);
  assert.equal(second.value?.slots.length, 1);
  assert.notEqual(first.audit?.windowHash, second.audit?.windowHash);
});
