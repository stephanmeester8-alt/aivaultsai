/**
 * CRM write-clientcontract (TASK 21-design, crm-write-tools.md §4).
 *
 * Apart contract naast de read-only CrmClient (TASK 20) — read-only blijft
 * structureel. Verplichte idempotencyKey per call: de client MOET de key
 * respecteren (zelfde key → zelfde record; `created: false` bij bestaand).
 * Geen delete/merge/import: DESTRUCTIVE-bewerkingen zijn CRITICAL en blijven
 * buiten dit contract.
 */

export interface CrmWriteClientContext {
  tenantId: string;
}

export interface CreateContactInput {
  name: string;
  email: string;
  company?: string;
  role?: string;
  idempotencyKey: string;
}

export interface UpdateContactInput {
  contactId: string;
  changes: { name?: string; email?: string; company?: string; role?: string };
  idempotencyKey: string;
}

export interface CreateLeadInput {
  company: string;
  status?: string;
  idempotencyKey: string;
}

export interface UpdateLeadInput {
  leadId: string;
  changes: { company?: string; status?: string };
  idempotencyKey: string;
}

export interface CrmWriteClient {
  createContact(
    input: CreateContactInput,
    ctx: CrmWriteClientContext,
  ): Promise<{ contactId: string; created: boolean }>;
  updateContact(
    input: UpdateContactInput,
    ctx: CrmWriteClientContext,
  ): Promise<{ contactId: string }>;
  createLead(
    input: CreateLeadInput,
    ctx: CrmWriteClientContext,
  ): Promise<{ leadId: string; created: boolean }>;
  updateLead(
    input: UpdateLeadInput,
    ctx: CrmWriteClientContext,
  ): Promise<{ leadId: string }>;
}
