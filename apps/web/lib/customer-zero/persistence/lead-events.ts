/**
 * Append-only lead event recording (TASK 13 / TASK 22).
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

/**
 * Record an event and return its event_id (or null when the write failed).
 * The id is used for traceability (e.g. qualification supporting events).
 */
export async function recordLeadEvent(
  eventSql: LeadEventSql,
  input: LeadEventInput,
): Promise<string | null> {
  try {
    const rows = await eventSql`
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
      RETURNING event_id
    `;
    const first = rows[0] as { event_id?: string } | undefined;
    return first?.event_id ?? null;
  } catch (error) {
    // Events register what happens; a failed write must not corrupt the flow.
    console.error(
      "[lead-events] failed to record event",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  }
}

/** Convenience wrapper using the shared DB client (lazy import keeps tests pure). */
export async function recordLeadEventWithClient(
  input: LeadEventInput,
): Promise<string | null> {
  const { sql } = await import("../../db/client");
  return recordLeadEvent(sql as unknown as LeadEventSql, input);
}
