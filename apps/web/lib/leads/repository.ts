/**
 * Lead-formulier — repository (insert in contact_leads).
 *
 * Injectable sql (zelfde patroon als de overige repositories) zodat tests
 * zonder echte DB draaien. De browser heeft GEEN pad naar deze tabel:
 * alleen server-code roept deze functie aan.
 */

import type { LeadService } from "./validation.ts";

export type LeadsSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export interface InsertContactLeadInput {
  /** Verplicht: NO TENANT = NO EXECUTION (Sprint 3). */
  tenantId: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  service: LeadService;
  message: string;
  status: "new";
  source: "website";
}

export interface InsertedContactLead {
  leadId: string;
  createdAt: string;
}

export async function insertContactLead(
  sql: LeadsSql,
  input: InsertContactLeadInput,
): Promise<InsertedContactLead> {
  const rows = (await sql`
    INSERT INTO contact_leads (tenant_id, name, email, phone, company, service, message, status, source)
    VALUES (
      ${input.tenantId}::uuid,
      ${input.name},
      ${input.email},
      ${input.phone ?? null},
      ${input.company ?? null},
      ${input.service},
      ${input.message},
      ${input.status},
      ${input.source}
    )
    RETURNING lead_id, created_at
  `) as { lead_id?: unknown; created_at?: unknown }[];

  const leadId = rows[0]?.lead_id;
  if (typeof leadId !== "string" || leadId.length === 0) {
    throw new Error("Contact lead insert returned no row.");
  }
  return {
    leadId,
    createdAt: typeof rows[0]?.created_at === "string" ? rows[0].created_at : new Date().toISOString(),
  };
}
