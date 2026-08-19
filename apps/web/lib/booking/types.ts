export type BookingStatus =
  | "REQUESTED"
  | "CONFIRMED"
  | "CANCELLED"
  | "FAILED";

export interface AvailabilityRequest {
  startDate: string;
  endDate: string;
  timezone: string;
  durationMinutes: number;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  timezone: string;
}

export interface AvailabilityResult {
  slots: AvailabilitySlot[];
  provider: string;
}

export interface CreateAppointmentRequest {
  leadId: string;
  conversationId: string;
  start: string;
  end: string;
  timezone: string;
  contactMethod: "phone" | "video" | "in_person";
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface CreatedAppointment {
  appointmentId: string;
  status: BookingStatus;
  start: string;
  end: string;
  timezone: string;
  externalCalendarEventId: string;
}

export interface CalendarProvider {
  getAvailability(
    request: AvailabilityRequest,
  ): Promise<AvailabilityResult>;

  createAppointment(
    request: CreateAppointmentRequest,
  ): Promise<CreatedAppointment>;

  cancelAppointment(
    externalCalendarEventId: string,
  ): Promise<void>;
}