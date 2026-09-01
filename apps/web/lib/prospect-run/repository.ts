import type { DispatchMode, ProspectInput, RunManifest } from "./types.ts";

export type ProspectSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

/** Conditional update is the concurrency boundary for background workers. */
export async function claimProspectRun(sql: ProspectSql, runId: string): Promise<boolean> {
  const rows = await sql`
    UPDATE prospect_runs
    SET state = 'ANALYZING', locked_at = NOW(), updated_at = NOW()
    WHERE run_id = ${runId}::uuid
      AND state = 'INTAKE'
      AND locked_at IS NULL
    RETURNING run_id
  `;
  return rows.length === 1;
}

export async function createProspectRun(
  sql: ProspectSql,
  input: ProspectInput,
  dispatchMode: DispatchMode,
  tenantId: string,
  idempotencyKey: string,
): Promise<string> {
  const rows = await sql`
    INSERT INTO prospect_runs (tenant_id, idempotency_key, state, dispatch_mode, prospect_profile)
    VALUES (${tenantId}::uuid, ${idempotencyKey}, 'INTAKE', ${dispatchMode}, ${JSON.stringify(input)}::jsonb)
    ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
      SET updated_at = NOW()
    RETURNING run_id
  `;
  const row = rows[0] as { run_id?: string } | undefined;
  if (!row?.run_id) throw new Error("Prospect run creation returned no run id.");
  return row.run_id;
}

export async function persistRunManifest(sql: ProspectSql, manifest: RunManifest): Promise<void> {
  await sql`
    UPDATE prospect_runs
    SET state = ${manifest.state}, score = ${manifest.score?.total ?? null}, route = ${manifest.route ?? null},
      manifest = ${JSON.stringify(manifest)}::jsonb, completed_at = NOW(), locked_at = NULL, updated_at = NOW()
    WHERE run_id = ${manifest.runId}::uuid
  `;
  await sql`
    INSERT INTO audit_manifests (run_id, manifest_type, manifest, manifest_sha256)
    VALUES (${manifest.runId}::uuid, 'run_manifest', ${JSON.stringify(manifest)}::jsonb, encode(digest(${JSON.stringify(manifest)}, 'sha256'), 'hex'))
  `;
}
