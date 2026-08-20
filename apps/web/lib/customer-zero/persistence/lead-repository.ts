import { sql } from "@/lib/db/client";
import type { LeadIntent, LeadSource, LeadStatus } from "../lead-types";
import { recordLeadEventWithClient } from "./lead-events";

export interface CreateLeadInput {
  conversationId?: string;
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
}

export async function createLead(
  input: CreateLeadInput,
): Promise<PersistedLead> {
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
  // Non-fatal: a failed event write must not break lead creation.
  await recordLeadEventWithClient({
    leadId: lead.lead_id,
    conversationId: lead.conversation_id ?? undefined,
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
  };
}