/**
 * TEST DOUBLE — must never be used in the production execution path.
 *
 * The MockCalendarProvider invents availability slots and confirms
 * appointments. It exists solely so tests can exercise the BookingService
 * against a fake calendar. Production code selects providers exclusively
 * through lib/booking/provider-factory.ts, which never returns this class.
 */

import type {
  AvailabilityRequest,
  AvailabilityResult,
  CalendarProvider,
  CreateAppointmentRequest,
  CreatedAppointment,
} from "../../lib/booking/types";

export class MockCalendarProvider implements CalendarProvider {
  async getAvailability(request: AvailabilityRequest): Promise<AvailabilityResult> {
    const date = request.startDate;
    return {
      available: true,
      provider: "mock",
      slots: [
        { start: `${date}T10:00:00`, end: `${date}T10:30:00`, timezone: request.timezone },
        { start: `${date}T14:00:00`, end: `${date}T14:30:00`, timezone: request.timezone },
        { start: `${date}T16:00:00`, end: `${date}T16:30:00`, timezone: request.timezone },
      ],
    };
  }

  async createAppointment(request: CreateAppointmentRequest): Promise<CreatedAppointment> {
    return {
      appointmentId: crypto.randomUUID(),
      status: "CONFIRMED",
      start: request.start,
      end: request.end,
      timezone: request.timezone,
      externalCalendarEventId: `mock-${crypto.randomUUID()}`,
    };
  }

  async cancelAppointment(externalCalendarEventId: string): Promise<void> {
    if (!externalCalendarEventId.trim()) {
      throw new Error("externalCalendarEventId is required");
    }
  }
}
