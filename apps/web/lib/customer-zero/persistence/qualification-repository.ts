/**
 * Lead qualification persistence (TASK 22).
 *
 * Writes a qualification decision into lead_qualifications so that a lead
 * is NEVER qualified by status alone: `status = QUALIFIED` on the lead is
 * accompanied by a persisted, traceable assessment (score, confidence,
 * reason, qualifiedBy, supporting events).
 *
 * Qualification is an assessment, not proof of conversion. The DB schema
 * enforces score 0..100 and at least one supporting event id.
 */

export type QualificationSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export type QualificationConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface CreateQualificationInput {
  leadId: string;
  score: number;
  confidence: QualificationConfidence;
  reason: string;
  qualifiedBy: string;
  /** At least one originating event id is required by the DB constraint. */
  supportingEventIds: string[];
  metadata?: Record<string, unknown>;
}

export interface PersistedQualification {
  qualificationId: string;
}

export async function createQualification(
  sql: QualificationSql,
  input: CreateQualificationInput,
): Promise<PersistedQualification> {
  const rows = await sql`
    INSERT INTO lead_qualifications (
      lead_id,
      score,
      confidence,
      reason,
      qualified_at,
      qualified_by,
      supporting_event_ids,
      metadata
    )
    VALUES (
      ${input.leadId}::uuid,
      ${input.score},
      ${input.confidence},
      ${input.reason},
      NOW(),
      ${input.qualifiedBy},
      ${input.supportingEventIds},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    RETURNING qualification_id
  `;
  const first = rows[0] as { qualification_id?: string } | undefined;
  if (!first?.qualification_id) {
    throw new Error("Qualification creation returned no record.");
  }
  return { qualificationId: String(first.qualification_id) };
}

/** Convenience wrapper using the shared DB client (lazy import keeps tests pure). */
export async function createQualificationWithClient(
  input: CreateQualificationInput,
): Promise<PersistedQualification> {
  const { sql } = await import("../../db/client");
  return createQualification(sql as unknown as QualificationSql, input);
}
