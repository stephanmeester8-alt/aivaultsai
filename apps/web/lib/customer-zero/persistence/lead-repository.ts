import type { LeadIntent, LeadSource, LeadStatus } from "../lead-types";
import { recordLeadEventWithClient } from "./lead-events.ts";

export interface CreateLeadInput {
  conversationId?: string;
  /** Optional correlation to the message that produced the lead. */
  messageId?: string;
  status: LeadStatus;
  source: LeadSource;
  intent: LeadIntent;
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  industry?: string;
  companySize?: string;
  problem?: string;
  desiredOutcome?: string;
  currentProcess?: string;
  preferredContactMethod?: string;
  metadata?: Record<string, unknown>;
}

export interface PersistedLead {
  leadId: string;
  conversationId: string | null;
  status: LeadStatus;
  source: LeadSource;
  intent: LeadIntent;
  /** event_id of the lead_created event (null when the event write failed). */
  leadCreatedEventId: string | null;
}

export async function createLead(
  input: CreateLeadInput,
): Promise<PersistedLead> {
  // Lazy client: keeps this module loadable without DATABASE_URL (tests).
  const { sql } = await import("../../db/client.ts");
  const rows = await sql`
    INSERT INTO leads (
      conversation_id,
      status,
      source,
      intent,
      name,
      company,
      email,
      phone,
      industry,
      company_size,
      problem,
      desired_outcome,
      current_process,
      preferred_contact_method,
      metadata
    )
    VALUES (
      ${input.conversationId ?? null}::uuid,
      ${input.status},
      ${input.source},
      ${input.intent},
      ${input.name ?? null},
      ${input.company ?? null},
      ${input.email ?? null},
      ${input.phone ?? null},
      ${input.industry ?? null},
      ${input.companySize ?? null},
      ${input.problem ?? null},
      ${input.desiredOutcome ?? null},
      ${input.currentProcess ?? null},
      ${input.preferredContactMethod ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    RETURNING
      lead_id,
      conversation_id,
      status,
      source,
      intent
  `;

  const lead = rows[0];

  if (!lead) {
    throw new Error("Lead creation returned no record.");
  }

  // Append-only event: lead_created records what already happened.
  // Non-fatal: a failed event write must not break lead creation. The
  // event_id is returned for traceability (e.g. qualification support).
  const leadCreatedEventId = await recordLeadEventWithClient({
    leadId: lead.lead_id,
    conversationId: lead.conversation_id ?? undefined,
    messageId: input.messageId,
    eventType: "lead_created",
    source: input.source,
    origin: input.source === "ai_assistant" ? "live_assistant" : "manual",
    metadata: { intent: input.intent, status: input.status },
  });

  return {
    leadId: lead.lead_id,
    conversationId: lead.conversation_id,
    status: lead.status,
    source: lead.source,
    intent: lead.intent,
    leadCreatedEventId,
  };
}
