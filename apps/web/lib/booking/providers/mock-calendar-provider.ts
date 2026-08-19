import type {
  AvailabilityRequest,
  AvailabilityResult,
  CalendarProvider,
  CreateAppointmentRequest,
  CreatedAppointment,
} from "../types";

export class MockCalendarProvider implements CalendarProvider {
  async getAvailability(
    request: AvailabilityRequest,
  ): Promise<AvailabilityResult> {
    const date = request.startDate;

    return {
      provider: "mock",
      slots: [
        {
          start: `${date}T10:00:00`,
          end: `${date}T10:30:00`,
          timezone: request.timezone,
        },
        {
          start: `${date}T14:00:00`,
          end: `${date}T14:30:00`,
          timezone: request.timezone,
        },
        {
          start: `${date}T16:00:00`,
          end: `${date}T16:30:00`,
          timezone: request.timezone,
        },
      ],
    };
  }

  async createAppointment(
    request: CreateAppointmentRequest,
  ): Promise<CreatedAppointment> {
    return {
      appointmentId: crypto.randomUUID(),
      status: "CONFIRMED",
      start: request.start,
      end: request.end,
      timezone: request.timezone,
      externalCalendarEventId: `mock-${crypto.randomUUID()}`,
    };
  }

  async cancelAppointment(
    externalCalendarEventId: string,
  ): Promise<void> {
    if (!externalCalendarEventId.trim()) {
      throw new Error("externalCalendarEventId is required");
    }
  }
}