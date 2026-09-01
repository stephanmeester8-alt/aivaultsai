/**
 * CRM-clientcontract (TASK 20-design, crm-readonly-tools.md §4).
 *
 * Read-only: geen create/update/delete-methoden — een write is binnen dit
 * contract structureel onmogelijk (write-contract volgt in TASK 21).
 * Vendor-agnostisch en injectable (zoals EmailProvider); de client MOET
 * tenant-gefiltreerd retourneren (contract-eis, afgedwongen in tests).
 */

export interface CrmContact {
  id: string;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
}

export interface CrmLead {
  id: string;
  company: string | null;
  status: string | null;
  owner: string | null;
  updatedAt: string | null;
}

export interface CrmClientContext {
  tenantId: string;
}

export interface SearchContactsQuery {
  q?: string;
  email?: string;
  company?: string;
  limit: number;
}

export interface CrmClient {
  searchContacts(
    query: SearchContactsQuery,
    ctx: CrmClientContext,
  ): Promise<CrmContact[]>;
  getLead(leadId: string, ctx: CrmClientContext): Promise<CrmLead | null>;
}
