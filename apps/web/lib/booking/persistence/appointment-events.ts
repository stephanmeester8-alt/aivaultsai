import { sql } from "@/lib/db/client";

export async function persistAppointmentCreatedEvent(input: {
  /** Verplicht: NO TENANT = NO EXECUTION (Sprint 3). */
  tenantId: string;
  leadId: string;
  conversationId: string;
  appointmentId: string;
}): Promise<void> {
  await sql`
    INSERT INTO lead_events (
      tenant_id,
      lead_id,
      conversation_id,
      event_type,
      source,
      origin,
      metadata
    )
    VALUES (
      ${input.tenantId}::uuid,
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
