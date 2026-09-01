/**
 * Email draft — idempotente opslag (TASK 18-design).
 *
 * Injectable sql (zelfde signature als EmployeeSql) zodat tests zonder echte
 * DB draaien. Idempotentie: INSERT met ON CONFLICT (tenant_id, session_id,
 * action_id) DO NOTHING; bij 0 rijen wordt de bestaande draft opgezocht.
 * Let op: zonder session_id/action_id is er geen dedupe-sleutel (NULL's zijn
 * in Postgres uniek per rij) — idempotentie vereist de employee-context.
 */

export type EmailSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export interface EmailDraftRow {
  draftId: string;
  to: string;
  subject: string;
  body: string;
  optOutLine: string;
  status: string;
}

export interface UpsertEmailDraftInput {
  tenantId: string;
  sessionId?: string | null;
  actionId?: string | null;
  to: string;
  subject: string;
  body: string;
  optOutLine: string;
}

export interface UpsertEmailDraftResult {
  draftId: string;
  created: boolean;
}

export async function upsertEmailDraft(
  sql: EmailSql,
  input: UpsertEmailDraftInput,
): Promise<UpsertEmailDraftResult> {
  const inserted = await sql`
    INSERT INTO email_drafts (tenant_id, session_id, action_id, to_address, subject, body, opt_out_line)
    VALUES (${input.tenantId}::uuid, ${input.sessionId ?? null}::uuid, ${input.actionId ?? null},
            ${input.to}, ${input.subject}, ${input.body}, ${input.optOutLine})
    ON CONFLICT (tenant_id, session_id, action_id) DO NOTHING
    RETURNING draft_id
  `;
  const first = inserted[0] as { draft_id?: unknown } | undefined;
  if (first?.draft_id) {
    return { draftId: String(first.draft_id), created: true };
  }

  const existing = await sql`
    SELECT draft_id FROM email_drafts
    WHERE tenant_id = ${input.tenantId}::uuid
      AND session_id IS NOT DISTINCT FROM ${input.sessionId ?? null}::uuid
      AND action_id IS NOT DISTINCT FROM ${input.actionId ?? null}
    LIMIT 1
  `;
  const row = existing[0] as { draft_id?: unknown } | undefined;
  if (!row?.draft_id) {
    throw new Error("Email draft upsert returned no row.");
  }
  return { draftId: String(row.draft_id), created: false };
}

export interface ClaimedEmailDraft {
  draftId: string;
  to: string;
  subject: string;
  body: string;
  optOutLine: string;
}

/**
 * Idempotente claim (TASK 19 §5): DRAFT/APPROVED → SENT via conditional
 * UPDATE = distributed lock. 0 rijen → al verstuurd/geannuleerd/niet
 * gevonden (de caller onderscheidt via getEmailDraftStatus).
 */
export async function claimEmailDraft(
  sql: EmailSql,
  tenantId: string,
  draftId: string,
): Promise<ClaimedEmailDraft | null> {
  const rows = await sql`
    UPDATE email_drafts
       SET status = 'SENT'
     WHERE draft_id = ${draftId}::uuid
       AND tenant_id = ${tenantId}::uuid
       AND status IN ('DRAFT','APPROVED')
    RETURNING draft_id, to_address, subject, body, opt_out_line
  `;
  const row = rows[0] as
    | { draft_id?: unknown; to_address?: unknown; subject?: unknown; body?: unknown; opt_out_line?: unknown }
    | undefined;
  if (!row?.draft_id) return null;
  return {
    draftId: String(row.draft_id),
    to: String(row.to_address),
    subject: String(row.subject),
    body: String(row.body),
    optOutLine: String(row.opt_out_line),
  };
}

/** Rollback na dispatcher-BLOCKED of provider-fout: status terug naar DRAFT. */
export async function revertEmailDraftStatus(
  sql: EmailSql,
  tenantId: string,
  draftId: string,
): Promise<void> {
  await sql`
    UPDATE email_drafts
       SET status = 'DRAFT'
     WHERE draft_id = ${draftId}::uuid
       AND tenant_id = ${tenantId}::uuid
       AND status = 'SENT'
  `;
}

/** Status-lookup voor foutonderscheid (DRAFT_NOT_FOUND vs ALREADY_SENT vs CANCELLED). */
export async function getEmailDraftStatus(
  sql: EmailSql,
  tenantId: string,
  draftId: string,
): Promise<string | null> {
  const rows = await sql`
    SELECT status FROM email_drafts
    WHERE draft_id = ${draftId}::uuid AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  const row = rows[0] as { status?: unknown } | undefined;
  return row?.status ? String(row.status) : null;
}

/**
 * ActionId-lookup voor de employee send-route (IMP-8): de employee-approval
 * bindt op `email_send:{actionId}`, de send-adapter op `email_send:{draftId}`.
 * Deze brug vertaalt draftId → actionId via de (tenant, session, action)-rij.
 */
export async function getEmailDraftActionId(
  sql: EmailSql,
  tenantId: string,
  draftId: string,
): Promise<string | null> {
  const rows = await sql`
    SELECT action_id FROM email_drafts
    WHERE draft_id = ${draftId}::uuid AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  const row = rows[0] as { action_id?: unknown } | undefined;
  const actionId = row?.action_id;
  return typeof actionId === "string" && actionId.length > 0 ? actionId : null;
}
