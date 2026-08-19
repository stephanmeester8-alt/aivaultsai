import { sql } from "@/lib/db/client";

export type PersistAppointmentInput = {
  leadId: string;
  conversationId: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  contactMethod: "phone" | "video" | "in_person";
  notes?: string;
  externalCalendarEventId?: string;
  metadata?: Record<string, unknown>;
};

export type PersistedAppointment = {
  appointmentId: string;
  leadId: string;
  conversationId: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
};

export async function persistAppointment(
  input: PersistAppointmentInput,
): Promise<PersistedAppointment> {
  const rows = await sql`
    INSERT INTO appointments (
      lead_id,
      conversation_id,
      requested_at,
      scheduled_start,
      scheduled_end,
      timezone,
      contact_method,
      notes,
      external_calendar_event_id,
      metadata,
      status
    )
    VALUES (
      ${input.leadId},
      ${input.conversationId},
      NOW(),
      ${input.scheduledStart},
      ${input.scheduledEnd},
      ${input.timezone},
      ${input.contactMethod},
      ${input.notes ?? null},
      ${input.externalCalendarEventId ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      'CONFIRMED'
    )
    RETURNING
      appointment_id AS "appointmentId",
      lead_id AS "leadId",
      conversation_id AS "conversationId",
      status,
      scheduled_start AS "scheduledStart",
      scheduled_end AS "scheduledEnd",
      timezone
  `;

  if (rows.length !== 1) {
    throw new Error(
      "Appointment persistence returned an unexpected result",
    );
  }

  return rows[0] as PersistedAppointment;
}