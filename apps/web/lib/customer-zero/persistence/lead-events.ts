/**
 * Append-only lead event recording (TASK 13).
 *
 * Events record what already happened in the customer-zero flow; they
 * must never determine or break business logic. A failed event write is
 * logged and swallowed so lead creation/intent detection stay the source
 * of truth. The event types used must exist in the lead_event_type enum
 * (see lib/db/migrations/001_customer_zero.sql).
 */

export type LeadEventSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export interface LeadEventInput {
  leadId?: string;
  conversationId?: string;
  eventType: string;
  source: string;
  origin: string;
  metadata?: Record<string, unknown>;
}

export async function recordLeadEvent(
  eventSql: LeadEventSql,
  input: LeadEventInput,
): Promise<void> {
  try {
    await eventSql`
      INSERT INTO lead_events (
        lead_id,
        conversation_id,
        event_type,
        source,
        origin,
        metadata
      )
      VALUES (
        ${input.leadId ?? null},
        ${input.conversationId ?? null},
        ${input.eventType},
        ${input.source},
        ${input.origin},
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
    `;
  } catch (error) {
    // Events register what happens; a failed write must not corrupt the flow.
    console.error(
      "[lead-events] failed to record event",
      error instanceof Error ? error.name : "unknown",
    );
  }
}

/** Convenience wrapper using the shared DB client (lazy import keeps tests pure). */
export async function recordLeadEventWithClient(
  input: LeadEventInput,
): Promise<void> {
  const { sql } = await import("../../db/client");
  await recordLeadEvent(sql as unknown as LeadEventSql, input);
}
