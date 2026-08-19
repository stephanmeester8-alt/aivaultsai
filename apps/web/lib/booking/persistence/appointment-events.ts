import { sql } from "@/lib/db/client";

export async function persistAppointmentCreatedEvent(input: {
  leadId: string;
  conversationId: string;
  appointmentId: string;
}): Promise<void> {
  await sql`
    INSERT INTO lead_events (
      lead_id,
      conversation_id,
      event_type,
      source,
      origin,
      metadata
    )
    VALUES (
      ${input.leadId},
      ${input.conversationId},
      'appointment_request_submitted',
      'ai_assistant',
      'appointment_flow',
      ${JSON.stringify({
        appointmentId: input.appointmentId,
      })}::jsonb
    )
  `;
}