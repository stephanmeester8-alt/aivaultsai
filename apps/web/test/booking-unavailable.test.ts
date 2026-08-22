import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { UnavailableCalendarProvider } from "../lib/booking/providers/unavailable-calendar-provider.ts";
import { createProductionCalendarProvider } from "../lib/booking/provider-factory.ts";

test("UnavailableCalendarProvider never invents availability", async () => {
  const provider = new UnavailableCalendarProvider();
  const result = await provider.getAvailability({
    startDate: "2026-08-16",
    endDate: "2026-08-17",
    timezone: "Europe/Amsterdam",
    durationMinutes: 30,
  });
  assert.equal(result.available, false);
  assert.deepEqual(result.slots, []);
  assert.equal(result.provider, "unavailable");
});

test("UnavailableCalendarProvider refuses to create appointments", async () => {
  const provider = new UnavailableCalendarProvider();
  await assert.rejects(
    () =>
      provider.createAppointment({
        leadId: "lead-1",
        conversationId: "conv-1",
        start: "2026-08-16T10:00:00",
        end: "2026-08-16T10:30:00",
        timezone: "Europe/Amsterdam",
        contactMethod: "video",
      }),
    /Calendar is not connected/,
  );
  await assert.rejects(() => provider.cancelAppointment("ext-1"), /Calendar is not connected/);
});

test("production provider factory defaults to the unavailable provider", () => {
  const provider = createProductionCalendarProvider();
  assert.ok(provider instanceof UnavailableCalendarProvider);
});

test("production provider factory accepts explicit unavailable/none", () => {
  process.env.CALENDAR_PROVIDER = "unavailable";
  assert.ok(createProductionCalendarProvider() instanceof UnavailableCalendarProvider);
  process.env.CALENDAR_PROVIDER = "none";
  assert.ok(createProductionCalendarProvider() instanceof UnavailableCalendarProvider);
  delete process.env.CALENDAR_PROVIDER;
});

test("production provider factory fails loudly for unimplemented providers", () => {
  process.env.CALENDAR_PROVIDER = "google";
  assert.throws(() => createProductionCalendarProvider(), /not implemented/i);
  delete process.env.CALENDAR_PROVIDER;
});

test("the mock calendar provider cannot leak into the production factory", () => {
  // Structural regression guard: the production provider factory must not
  // import any test double (mock calendar fixture).
  const factoryPath = new URL("../lib/booking/provider-factory.ts", import.meta.url);
  const source = readFileSync(factoryPath, "utf8");
  assert.ok(!/import[^;]*mock-calendar-provider/i.test(source));
  assert.ok(!/from\s+["'][^"']*fixtures/i.test(source));
});
