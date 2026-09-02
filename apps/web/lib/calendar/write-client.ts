/**
 * Calendar write-clientcontract (TASK 23-design, calendar-write-tools.md §4).
 *
 * Apart contract naast de read-only CalendarProvider (TASK 22) — read-only
 * blijft structureel. HERGEBRUIKT de bestaande CalendarProvider-methoden
 * (createAppointment/cancelAppointment); updateAppointment is de enige gap
 * in het bestaande provider-contract en is een contract-eis voor de
 * (toekomstige) provider-implementatie (bv. Google Calendar events.patch).
 *
 * Fail-closed:
 * - verplichte idempotencyKey per call: de client MOET de key respecteren
 *   (zelfde key → zelfde afspraak; `created: false` bij bestaand);
 * - cancel is definitief: alleen REQUESTED/CONFIRMED → CANCELLED, dubbel
 *   cancel → geen tweede side effect (conditional update, TASK 19-patroon);
 * - geen delete/opschoning: DESTRUCTIVE-bewerkingen blijven buiten dit contract.
 */

export interface CalendarWriteClientContext {
  tenantId: string;
}

/**
 * Getypeerde client-fout (TASK 23-design §6): de client-implementatie
 * communiceert fail-closed codes zoals APPOINTMENT_NOT_FOUND (conditional
 * update → 0 rijen, afspraak bestaat niet) en ALREADY_CANCELLED (status is
 * al CANCELLED — geen tweede side effect). De adapter geeft bekende codes
 * door; onbekende fouten worden CALENDAR_CLIENT_ERROR.
 */
export class CalendarWriteClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CalendarWriteClientError";
    this.code = code;
  }
}

export type CalendarContactMethod = "phone" | "video" | "in_person";

export interface CreateCalendarAppointmentInput {
  leadId: string;
  conversationId: string;
  start: string;
  end: string;
  timezone: string;
  contactMethod: CalendarContactMethod;
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
  idempotencyKey: string;
}

export interface CreatedCalendarAppointment {
  appointmentId: string;
  status: "REQUESTED" | "CONFIRMED" | "CANCELLED" | "FAILED";
  externalCalendarEventId: string;
  created: boolean;
}

export interface UpdateCalendarAppointmentInput {
  appointmentId: string;
  changes: {
    start?: string;
    end?: string;
    timezone?: string;
    contactMethod?: CalendarContactMethod;
  };
  idempotencyKey: string;
}

export interface UpdatedCalendarAppointment {
  appointmentId: string;
  status: "REQUESTED" | "CONFIRMED" | "CANCELLED" | "FAILED";
  externalCalendarEventId: string;
}

export interface CancelCalendarAppointmentInput {
  appointmentId: string;
  reason?: string;
  idempotencyKey: string;
}

export interface CancelledCalendarAppointment {
  appointmentId: string;
  status: "CANCELLED";
}

export interface CalendarWriteClient {
  createAppointment(
    input: CreateCalendarAppointmentInput,
    ctx: CalendarWriteClientContext,
  ): Promise<CreatedCalendarAppointment>;

  /**
   * Update-gap: bestaat NIET in CalendarProvider. Tot de provider dit
   * implementeert, moet de client-implementatie NOT_IMPLEMENTED gooien —
   * nooit simuleren.
   */
  updateAppointment(
    input: UpdateCalendarAppointmentInput,
    ctx: CalendarWriteClientContext,
  ): Promise<UpdatedCalendarAppointment>;

  cancelAppointment(
    input: CancelCalendarAppointmentInput,
    ctx: CalendarWriteClientContext,
  ): Promise<CancelledCalendarAppointment>;
}
