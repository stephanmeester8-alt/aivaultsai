/**
 * Centrale CRM write-adapter (TASK 21-design).
 *
 * Fail-closed keten: schema (additionalProperties: false, dedupeKey
 * verplicht, update â‰¥ 1 veld) â†’ tenant-check â†’ approval (APPROVED + binding
 * `crm_write:{toolId}` + TTL) â†’ client met idempotencyKey â†’ audit (approvalId
 * + key-hash + resultaat-id; nooit payload).
 *
 * - idempotencyKey = sha256({toolId, tenantId, genormaliseerde payload});
 *   de client MOET de key respecteren (contract + testmatrix);
 * - client-fout â†’ gecontroleerde fout (geen ongecontroleerde retry).
 */

import { createHash } from "node:crypto";

import type { ApprovalGate } from "../../approvals/approval-gate.ts";
import type { CrmWriteClient } from "../../crm/write-client.ts";

const MAX_200 = 200;
const MAX_320 = 320;
const MAX_120 = 120;
const MAX_60 = 60;

export interface CrmWriteDeps {
  client: CrmWriteClient;
  tenantId: string;
  approvalGate: ApprovalGate;
  now?: () => string;
  log?: (message: string) => void;
}

export interface CrmWriteAudit {
  toolId: string;
  approvalId: string;
  idempotencyKeyHash: string;
  resultId: string | null;
  created: boolean;
}

export interface CrmWriteToolResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  audit?: CrmWriteAudit;
}

export type CrmWriteToolId = "contact_create" | "contact_update" | "lead_create" | "lead_update";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function optionalString(value: unknown, max: number): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null; // ongeldig
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function hasChanges(changes: Record<string, string | undefined>): boolean {
  return Object.values(changes).some((value) => value !== undefined);
}

interface ValidatedInput {
  toolId: CrmWriteToolId;
  payload: Record<string, unknown>;
  changes: Record<string, string | undefined>;
  dedupeKey: string;
  approvalId: string;
}

function validateWrite(toolId: CrmWriteToolId, input: unknown): ValidatedInput | { error: string } {
  if (!isRecord(input)) return { error: "INVALID_WRITE_INPUT" };
  const allowed: Record<CrmWriteToolId, Set<string>> = {
    contact_create: new Set(["name", "email", "company", "role", "dedupeKey", "approvalId"]),
    contact_update: new Set(["contactId", "name", "email", "company", "role", "dedupeKey", "approvalId"]),
    lead_create: new Set(["company", "status", "dedupeKey", "approvalId"]),
    lead_update: new Set(["leadId", "company", "status", "dedupeKey", "approvalId"]),
  };
  for (const key of Object.keys(input)) {
    if (!allowed[toolId].has(key)) return { error: "INVALID_WRITE_INPUT" };
  }
  const dedupeKey = requiredString(input.dedupeKey, MAX_200);
  if (!dedupeKey) return { error: "INVALID_WRITE_INPUT" }; // idempotentie onmogelijk
  const approvalId = requiredString(input.approvalId, MAX_200);
  if (!approvalId) return { error: "INVALID_WRITE_INPUT" }; // approval verplicht

  if (toolId === "contact_create") {
    const name = requiredString(input.name, MAX_200);
    const email = requiredString(input.email, MAX_320);
    if (!name || !email) return { error: "INVALID_WRITE_INPUT" };
    const company = optionalString(input.company, MAX_200);
    const role = optionalString(input.role, MAX_120);
    if (company === null || role === null) return { error: "INVALID_WRITE_INPUT" };
    return {
      toolId,
      payload: { name, email, company, role, dedupeKey },
      changes: {},
      dedupeKey,
      approvalId,
    };
  }
  if (toolId === "contact_update") {
    const contactId = requiredString(input.contactId, MAX_200);
    if (!contactId) return { error: "INVALID_WRITE_INPUT" };
    const rawChanges = {
      name: optionalString(input.name, MAX_200),
      email: optionalString(input.email, MAX_320),
      company: optionalString(input.company, MAX_200),
      role: optionalString(input.role, MAX_120),
    };
    if (Object.values(rawChanges).some((v) => v === null)) return { error: "INVALID_WRITE_INPUT" };
    const changes: Record<string, string | undefined> = {
      name: rawChanges.name ?? undefined,
      email: rawChanges.email ?? undefined,
      company: rawChanges.company ?? undefined,
      role: rawChanges.role ?? undefined,
    };
    if (!hasChanges(changes)) return { error: "INVALID_WRITE_INPUT" }; // minstens Ã©Ã©n veld
    return { toolId, payload: { contactId, ...changes, dedupeKey }, changes, dedupeKey, approvalId };
  }
  if (toolId === "lead_create") {
    const company = requiredString(input.company, MAX_200);
    if (!company) return { error: "INVALID_WRITE_INPUT" };
    const status = optionalString(input.status, MAX_60);
    if (status === null) return { error: "INVALID_WRITE_INPUT" };
    return { toolId, payload: { company, status, dedupeKey }, changes: {}, dedupeKey, approvalId };
  }
  // lead_update
  const leadId = requiredString(input.leadId, MAX_200);
  if (!leadId) return { error: "INVALID_WRITE_INPUT" };
  const rawLeadChanges = {
    company: optionalString(input.company, MAX_200),
    status: optionalString(input.status, MAX_60),
  };
  if (Object.values(rawLeadChanges).some((v) => v === null)) return { error: "INVALID_WRITE_INPUT" };
  const changes: Record<string, string | undefined> = {
    company: rawLeadChanges.company ?? undefined,
    status: rawLeadChanges.status ?? undefined,
  };
  if (!hasChanges(changes)) return { error: "INVALID_WRITE_INPUT" };
  return { toolId, payload: { leadId, ...changes, dedupeKey }, changes, dedupeKey, approvalId };
}

export async function executeCrmWrite(
  toolId: CrmWriteToolId,
  input: unknown,
  deps: CrmWriteDeps,
): Promise<CrmWriteToolResult> {
  if (!deps.tenantId || deps.tenantId.trim().length === 0) {
    return { ok: false, error: "TENANT_REQUIRED" };
  }
  const validated = validateWrite(toolId, input);
  if ("error" in validated) {
    return { ok: false, error: validated.error };
  }

  // Approval vÃ³Ã³r de client (APPROVED + binding + TTL â€” fail-closed).
  const approval = await deps.approvalGate.check({
    approvalId: validated.approvalId,
    requestedAction: `crm_write:${toolId}`,
    now: deps.now?.(),
  });
  if (!approval.allowed) {
    return { ok: false, error: approval.reason };
  }

  const idempotencyKey = sha256(
    JSON.stringify({ toolId, tenantId: deps.tenantId, payload: validated.payload }),
  );
  const log = deps.log ?? ((message: string) => console.info(`[crm-write] ${message}`));

  try {
    let resultId: string | null = null;
    let created = false;

    if (toolId === "contact_create") {
      const createdContact = await deps.client.createContact(
        {
          name: validated.payload.name as string,
          email: validated.payload.email as string,
          company: validated.payload.company as string | undefined,
          role: validated.payload.role as string | undefined,
          idempotencyKey,
        },
        { tenantId: deps.tenantId },
      );
      resultId = createdContact.contactId;
      created = createdContact.created;
    } else if (toolId === "contact_update") {
      const updated = await deps.client.updateContact(
        {
          contactId: validated.payload.contactId as string,
          changes: validated.changes as { name?: string; email?: string; company?: string; role?: string },
          idempotencyKey,
        },
        { tenantId: deps.tenantId },
      );
      resultId = updated.contactId;
    } else if (toolId === "lead_create") {
      const createdLead = await deps.client.createLead(
        {
          company: validated.payload.company as string,
          status: validated.payload.status as string | undefined,
          idempotencyKey,
        },
        { tenantId: deps.tenantId },
      );
      resultId = createdLead.leadId;
      created = createdLead.created;
    } else {
      const updated = await deps.client.updateLead(
        {
          leadId: validated.payload.leadId as string,
          changes: validated.changes as { company?: string; status?: string },
          idempotencyKey,
        },
        { tenantId: deps.tenantId },
      );
      resultId = updated.leadId;
    }

    log(`[crm-write:${deps.tenantId}] ${toolId} -> ${resultId} (created=${created})`);
    return {
      ok: true,
      value: { resultId, created },
      audit: {
        toolId,
        approvalId: validated.approvalId,
        idempotencyKeyHash: sha256(idempotencyKey),
        resultId,
        created,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`[crm-write:${deps.tenantId}] ${toolId} failed: ${message.slice(0, 200)}`);
    return { ok: false, error: "CRM_CLIENT_ERROR" };
  }
}

