import type { CalendarProvider } from "./types.ts";
import { UnavailableCalendarProvider } from "./providers/unavailable-calendar-provider.ts";

/**
 * Production calendar provider selection (TASK 22).
 *
 * Default: explicit unavailable state — no slots, no appointments.
 * A real provider (e.g. Google Calendar) must be implemented and explicitly
 * selected; the mock calendar provider is a TEST DOUBLE and must never be
 * reachable from this factory.
 */
export function createProductionCalendarProvider(): CalendarProvider {
  const configured = process.env.CALENDAR_PROVIDER;

  if (configured === undefined || configured === "unavailable" || configured === "none") {
    return new UnavailableCalendarProvider();
  }

  // A configured-but-unimplemented provider must fail loudly instead of
  // silently degrading to fake availability.
  throw new Error(
    `CALENDAR_PROVIDER=${configured} is not implemented. No real calendar integration exists yet.`,
  );
}
