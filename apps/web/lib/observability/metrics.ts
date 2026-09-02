/**
 * Agent Tool Platform — Observability-contract (TASK 24, observability.md §3).
 *
 * Elke tool-call en elke agent-run is traceable. Metrics zijn
 * OBSERVABILITY-ONLY: ze beslissen nooit iets en mogen business-logica nooit
 * breken (bestaand patroon: assistant-funnel.ts — "GA4 observability only").
 *
 * Fail-closed:
 * - recorder ontbreekt (geen injectie) → no-op, tool-call draait normaal;
 * - recorder-fout (bv. DB-down) → gelogd, NIET gegooid; de beslissing
 *   (ALLOW/DENY) blijft staan;
 * - secrets onmogelijk door contract: alleen argumentsHash (SHA-256) +
 *   compacte resultSummary (≤ 200 tekens, geen PII).
 */

import type { RiskLevel } from "../tool-registry/types.ts";

export type ToolCallStatus = "ALLOWED" | "DENIED" | "NOT_IMPLEMENTED" | "ERROR" | "TIMEOUT";

export interface ToolCallRecord {
  /** Uniek per tool-call. */
  executionId: string;
  tenantId: string;
  agentId: string;
  sessionId: string | null;
  toolId: string;
  /** SHA-256; NOOIT ruwe argumenten. */
  argumentsHash: string;
  startedAt: string;
  finishedAt: string;
  status: ToolCallStatus;
  riskLevel: RiskLevel;
  approvalId: string | null;
  /** Compact, ≤ 200 tekens, geen secrets (patroon: {draftId}, {count}). */
  resultSummary: string;
  errorCode: string | null;
  /** bv. runId, draftId, appointmentId. */
  evidenceRefs: readonly string[];
}

export interface MetricRecorder {
  /** Non-fatal: een recorder-fout verandert nooit een ALLOW/DENY-uitspraak. */
  recordCall(record: ToolCallRecord): Promise<void> | void;

  /** TASK 7-koppeling: discovery-calls meten (niet in de pure functie). */
  recordDiscovery(intentHash: string, agentId: string, toolCount: number): void;
}

/** Default (tests/prod zonder injectie): observability-only no-op. */
export const NoopRecorder: MetricRecorder = {
  recordCall() {
    /* no-op — observability-only */
  },
  recordDiscovery() {
    /* no-op */
  },
};
