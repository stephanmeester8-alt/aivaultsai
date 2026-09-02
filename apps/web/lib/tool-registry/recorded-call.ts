/**
 * Agent Tool Platform — recordedCall wrap (TASK 24, observability.md §5).
 *
 * Wrap-functie náást de execution-flow: start/finish/status → één
 * ToolCallRecord per call. Observability-only:
 * - recorder ontbreekt → no-op (call draait normaal);
 * - recorder-fout → gelogd, NIET gegooid (ALLOW/DENY blijft staan);
 * - status-bepaling: ALLOWED / DENIED (fail-closed codes) /
 *   NOT_IMPLEMENTED / ERROR / TIMEOUT (optionele timeoutMs);
 * - NEVER SECRETS: alleen argumentsHash + compacte resultSummary
 *   (caller levert summary zonder PII; default "ok"/error-code).
 *
 * Beperking (bekend): bij TIMEOUT loopt de onderliggende call door — de
 * wrap observeert en registreert, hij annuleert niet.
 */

import { randomUUID } from "node:crypto";

import type { MetricRecorder, ToolCallStatus } from "../observability/metrics.ts";
import type { RiskLevel } from "./types.ts";

/** Fail-closed DENY-codes (gate/adapters) → status DENIED. */
const DENY_ERRORS = new Set([
  "UNKNOWN_TOOL",
  "TOOL_DISABLED",
  "TENANT_REQUIRED",
  "BUDGET_EXCEEDED",
  "ALREADY_CANCELLED",
  "APPOINTMENT_NOT_FOUND",
  "DRAFT_NOT_FOUND",
  "ALREADY_SENT",
]);

export interface RecordedCallOptions {
  tenantId: string;
  agentId: string;
  sessionId?: string | null;
  toolId: string;
  riskLevel: RiskLevel;
  /** SHA-256 van de argumenten — NOOIT ruwe argumenten. */
  argumentsHash: string;
  approvalId?: string | null;
  /** Compacte samenvatting zonder PII (patroon: {draftId}, {count}). */
  resultSummary?: string;
  executionId?: string;
  now?: () => string;
  timeoutMs?: number;
  evidenceRefs?: readonly string[];
}

export interface ToolCallOutcome {
  ok: boolean;
  value?: unknown;
  error?: string;
}

function statusFor(error: string | undefined): ToolCallStatus {
  if (!error) return "ALLOWED";
  if (error === "NOT_IMPLEMENTED" || error === "TIMEOUT") return error;
  if (DENY_ERRORS.has(error) || error.startsWith("APPROVAL_") || error.startsWith("INVALID_")) {
    return "DENIED";
  }
  return "ERROR";
}

export async function recordedCall<T extends ToolCallOutcome>(
  recorder: MetricRecorder | undefined,
  options: RecordedCallOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const executionId = options.executionId ?? randomUUID();

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = (): Promise<T> =>
    options.timeoutMs === undefined
      ? fn()
      : Promise.race([
          fn(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              reject(new Error("TIMEOUT"));
            }, options.timeoutMs);
          }),
        ]);

  let outcome: T;
  try {
    outcome = await run();
  } catch (error) {
    outcome = {
      ok: false,
      error: timedOut ? "TIMEOUT" : error instanceof Error ? error.message : String(error),
    } as T;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  const errorCode = outcome.ok ? null : (outcome.error ?? "ERROR");
  const status = statusFor(errorCode ?? undefined);
  const record = {
    executionId,
    tenantId: options.tenantId,
    agentId: options.agentId,
    sessionId: options.sessionId ?? null,
    toolId: options.toolId,
    argumentsHash: options.argumentsHash,
    startedAt,
    finishedAt: now(),
    status,
    riskLevel: options.riskLevel,
    approvalId: options.approvalId ?? null,
    resultSummary: options.resultSummary ?? (outcome.ok ? "ok" : (errorCode ?? "failed")),
    errorCode,
    evidenceRefs: options.evidenceRefs ?? [],
  };

  if (recorder) {
    try {
      await recorder.recordCall(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[observability] recorder failed (non-fatal): ${message.slice(0, 200)}`);
    }
  }

  return outcome;
}
