import {
  persistAppointment,
} from "./persistence/appointment-repository";
import {
  persistAppointmentCreatedEvent,
} from "./persistence/appointment-events";
import type {
  AvailabilityRequest,
  AvailabilityResult,
  CalendarProvider,
  CreateAppointmentRequest,
  CreatedAppointment,
} from "./types";

export class BookingService {
  constructor(
    private readonly calendarProvider: CalendarProvider,
  ) {}

  async getAvailability(
    request: AvailabilityRequest,
  ): Promise<AvailabilityResult> {
    return this.calendarProvider.getAvailability(request);
  }

  async createAppointment(
    request: CreateAppointmentRequest,
  ): Promise<CreatedAppointment> {
    // Eerst de echte calendar provider laten bevestigen.
    const appointment =
      await this.calendarProvider.createAppointment(request);

    // Daarna Customer Zero persistence.
    const persistedAppointment =
      await persistAppointment({
        leadId: request.leadId,
        conversationId: request.conversationId,
        scheduledStart: appointment.start,
        scheduledEnd: appointment.end,
        timezone: appointment.timezone,
        contactMethod: request.contactMethod,
        notes: request.notes,
        externalCalendarEventId:
          appointment.externalCalendarEventId,
        metadata: {
          name: request.name,
          email: request.email,
          phone: request.phone,
          provider: "calendar",
        },
      });

    await persistAppointmentCreatedEvent({
      leadId: request.leadId,
      conversationId: request.conversationId,
      appointmentId: persistedAppointment.appointmentId,
    });

    return {
      ...appointment,
      appointmentId: persistedAppointment.appointmentId,
      status: "CONFIRMED",
    };
  }
}