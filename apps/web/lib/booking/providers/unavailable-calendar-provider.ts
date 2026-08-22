import type {
  AvailabilityRequest,
  AvailabilityResult,
  CalendarProvider,
  CreateAppointmentRequest,
  CreatedAppointment,
} from "../types.ts";

/**
 * Explicit unavailable state for the calendar provider.
 *
 * Until a real calendar integration is connected, availability is
 * `available: false` and appointments can never be created. This provider
 * MUST NOT invent slots, confirm appointments, or claim calendar access.
 */
export class CalendarUnavailableError extends Error {
  constructor(message = "Calendar is not connected") {
    super(message);
    this.name = "CalendarUnavailableError";
  }
}

export class UnavailableCalendarProvider implements CalendarProvider {
  async getAvailability(request: AvailabilityRequest): Promise<AvailabilityResult> {
    void request;
    return {
      available: false,
      slots: [],
      provider: "unavailable",
      reason: "Calendar is not connected. Availability cannot be shown.",
    };
  }

  async createAppointment(request: CreateAppointmentRequest): Promise<CreatedAppointment> {
    void request;
    throw new CalendarUnavailableError(
      "Calendar is not connected. No appointment can be created.",
    );
  }

  async cancelAppointment(externalCalendarEventId: string): Promise<void> {
    void externalCalendarEventId;
    throw new CalendarUnavailableError(
      "Calendar is not connected. No appointment can be cancelled.",
    );
  }
}
