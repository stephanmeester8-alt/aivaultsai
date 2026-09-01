/**
 * Autonomous Employee — work session persistence (TASK FASE 9/12/13).
 *
 * Sessions are durable and resumable:
 * - one session per (tenant_id, session_key) via a unique constraint;
 * - every step is appended with status + detail (audit trail);
 * - a crashed RUNNING session is either resumed (same key returns it) or
 *   explicitly failed; retries create a NEW session only when the previous
 *   one is terminal (FAILED/CANCELLED), so retries are safe.
 */

import type {
  EmployeeWorkSessionConfig,
  EmployeeWorkSessionRecord,
  EmployeeWorkSessionSummary,
  WorkSessionStatus,
} from "./types.ts";

export type EmployeeSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export interface CreateSessionResult {
  session: EmployeeWorkSessionRecord;
  created: boolean;
}

function mapRow(row: Record<string, unknown>): EmployeeWorkSessionRecord {
  return {
    sessionId: String(row.session_id),
    tenantId: String(row.tenant_id),
    sessionKey: String(row.session_key),
    status: row.status as WorkSessionStatus,
    config: row.config as EmployeeWorkSessionConfig,
    summary: (row.summary as EmployeeWorkSessionSummary | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Idempotent session creation: ON CONFLICT (tenant_id, session_key) DO NOTHING.
 * A second start for the same key returns the existing session (created=false)
 * — this is the distributed lock for the morning run.
 */
export async function createWorkSession(
  sql: EmployeeSql,
  config: EmployeeWorkSessionConfig,
): Promise<CreateSessionResult> {
  const inserted = await sql`
    INSERT INTO employee_work_sessions (tenant_id, session_key, status, config)
    VALUES (${config.tenantId}::uuid, ${config.sessionKey}, 'PENDING', ${JSON.stringify(config)}::jsonb)
    ON CONFLICT (tenant_id, session_key) DO NOTHING
    RETURNING session_id, tenant_id, session_key, status, config, summary, created_at, updated_at
  `;
  const first = inserted[0] as Record<string, unknown> | undefined;
  if (first?.session_id) {
    return { session: mapRow(first), created: true };
  }

  const existing = await getWorkSessionByKey(sql, config.tenantId, config.sessionKey);
  if (!existing) {
    throw new Error("Work session creation returned no session.");
  }
  return { session: existing, created: false };
}

export async function getWorkSessionByKey(
  sql: EmployeeSql,
  tenantId: string,
  sessionKey: string,
): Promise<EmployeeWorkSessionRecord | null> {
  const rows = await sql`
    SELECT session_id, tenant_id, session_key, status, config, summary, created_at, updated_at
    FROM employee_work_sessions
    WHERE tenant_id = ${tenantId}::uuid AND session_key = ${sessionKey}
    LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function getWorkSession(
  sql: EmployeeSql,
  sessionId: string,
): Promise<EmployeeWorkSessionRecord | null> {
  const rows = await sql`
    SELECT session_id, tenant_id, session_key, status, config, summary, created_at, updated_at
    FROM employee_work_sessions
    WHERE session_id = ${sessionId}::uuid
    LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function updateWorkSessionStatus(
  sql: EmployeeSql,
  sessionId: string,
  status: WorkSessionStatus,
  summary: EmployeeWorkSessionSummary | null,
): Promise<void> {
  await sql`
    UPDATE employee_work_sessions
    SET status = ${status},
        summary = ${summary ? JSON.stringify(summary) : null}::jsonb,
        started_at = COALESCE(started_at, NOW()),
        completed_at = CASE WHEN ${status} IN ('COMPLETED', 'FAILED', 'CANCELLED')
          THEN NOW() ELSE completed_at END
    WHERE session_id = ${sessionId}::uuid
  `;
}

export async function appendWorkSessionStep(
  sql: EmployeeSql,
  sessionId: string,
  step: string,
  status: string,
  detail: unknown,
): Promise<void> {
  await sql`
    INSERT INTO employee_work_session_steps (session_id, step, status, detail)
    VALUES (${sessionId}::uuid, ${step}, ${status}, ${JSON.stringify(detail ?? {})}::jsonb)
  `;
}
