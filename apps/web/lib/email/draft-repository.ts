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
