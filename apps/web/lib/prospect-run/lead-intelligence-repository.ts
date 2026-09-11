import type { DiscoverySql } from "./discovery-repository.ts";
import type { LeadIntelligenceResult } from "./lead-intelligence.ts";

/**
 * Idempotently persists one scored website observation. Every statement is
 * tenant-scoped and parent identity is resolved through tenant-bound selects.
 */
export async function persistLeadIntelligence(
  sql: DiscoverySql,
  input: { tenantId: string; companyId: string; prospectRunId?: string; result: LeadIntelligenceResult },
): Promise<void> {
  for (const signal of input.result.signals) {
    const rows = await sql`
      INSERT INTO lead_signals (
        tenant_id, company_id, prospect_run_id, signal_type, confidence,
        observed_at, source_class, source_url, verification_status
      )
      SELECT ${input.tenantId}::uuid, c.company_id,
        CASE WHEN ${input.prospectRunId ?? null}::uuid IS NULL THEN NULL ELSE pr.run_id END,
        ${signal.type}, ${signal.confidence}, ${signal.observedAt}::timestamptz,
        ${signal.sourceClass}, ${signal.sourceUrl}, ${signal.verificationStatus}
      FROM companies c
      LEFT JOIN prospect_runs pr ON pr.run_id = ${input.prospectRunId ?? null}::uuid
        AND pr.tenant_id = ${input.tenantId}::uuid
      WHERE c.company_id = ${input.companyId}::uuid AND c.tenant_id = ${input.tenantId}::uuid
        AND (${input.prospectRunId ?? null}::uuid IS NULL OR pr.run_id IS NOT NULL)
      ON CONFLICT (tenant_id, company_id, signal_type, source_url, observed_at)
      DO UPDATE SET confidence = EXCLUDED.confidence, verification_status = EXCLUDED.verification_status
      RETURNING signal_id
    `;
    const signalId = (rows[0] as { signal_id?: string } | undefined)?.signal_id;
    if (!signalId) throw new Error("TENANT_COMPANY_NOT_FOUND");
    await sql`
      INSERT INTO lead_evidence (
        tenant_id, signal_id, evidence_summary, source_url, captured_at, source_hash
      )
      SELECT ${input.tenantId}::uuid, s.signal_id, ${signal.evidence.summary},
        ${signal.evidence.sourceUrl}, ${signal.evidence.capturedAt}::timestamptz, ${signal.evidence.sourceHash}
      FROM lead_signals s
      WHERE s.signal_id = ${signalId}::uuid AND s.tenant_id = ${input.tenantId}::uuid
      ON CONFLICT (tenant_id, signal_id, source_hash) DO NOTHING
    `;
  }

  const opportunity = input.result.opportunity;
  const scores = opportunity.scores;
  const rows = await sql`
    INSERT INTO lead_opportunities (
      tenant_id, company_id, prospect_run_id, status, why_now, observed_pain,
      recommended_solution, icp_score, pain_score, signal_score,
      automation_fit_score, evidence_quality_score, opportunity_score,
      scoring_version, scored_at
    )
    SELECT ${input.tenantId}::uuid, c.company_id,
      CASE WHEN ${input.prospectRunId ?? null}::uuid IS NULL THEN NULL ELSE pr.run_id END,
      ${opportunity.status}, ${opportunity.whyNow}, ${opportunity.observedPain},
      ${opportunity.recommendedSolution}, ${scores.icp}, ${scores.pain}, ${scores.signal},
      ${scores.automationFit}, ${scores.evidenceQuality}, ${scores.opportunity},
      ${scores.scoringVersion}, ${opportunity.scoredAt}::timestamptz
    FROM companies c
    LEFT JOIN prospect_runs pr ON pr.run_id = ${input.prospectRunId ?? null}::uuid
      AND pr.tenant_id = ${input.tenantId}::uuid
    WHERE c.company_id = ${input.companyId}::uuid AND c.tenant_id = ${input.tenantId}::uuid
      AND (${input.prospectRunId ?? null}::uuid IS NULL OR pr.run_id IS NOT NULL)
    ON CONFLICT (tenant_id, company_id, prospect_run_id, scoring_version)
    DO UPDATE SET status = EXCLUDED.status, why_now = EXCLUDED.why_now,
      observed_pain = EXCLUDED.observed_pain, recommended_solution = EXCLUDED.recommended_solution,
      icp_score = EXCLUDED.icp_score, pain_score = EXCLUDED.pain_score,
      signal_score = EXCLUDED.signal_score, automation_fit_score = EXCLUDED.automation_fit_score,
      evidence_quality_score = EXCLUDED.evidence_quality_score,
      opportunity_score = EXCLUDED.opportunity_score, scored_at = EXCLUDED.scored_at,
      updated_at = NOW()
    RETURNING opportunity_id
  `;
  if (!(rows[0] as { opportunity_id?: string } | undefined)?.opportunity_id) {
    throw new Error("TENANT_COMPANY_NOT_FOUND");
  }
}
