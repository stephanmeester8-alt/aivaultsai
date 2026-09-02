/**
 * Agent Tool Platform — PostgresRecorder (TASK 24, observability.md §4–§5).
 *
 * Schrijft elke tool-call naar tool_call_records (migratie 007) en houdt de
 * FASE 12-metrieken bij als in-memory counters (Prometheus-stijl label-keys:
 * `tool_calls_total{tool="...",agent="...",status="..."}`). Export naar een
 * metrics-backend (Prometheus/OTel) kan later via dezelfde MetricRecorder-
 * interface — geen vendor-lock-in.
 *
 * NON-FATAL: een failed write wordt gelogd en geslikt — de recorder mag de
 * tool-call die hij observeert nooit breken (observability-only).
 * NEVER SECRETS: alleen argumentsHash + compacte resultSummary.
 */

import type { MetricRecorder, ToolCallRecord } from "./metrics.ts";

export type ObservabilitySql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

/** Prometheus-stijl key: `name{label="value",...}`. */
function metricKey(name: string, labels: Readonly<Record<string, string>>): string {
  const labelPart = Object.entries(labels)
    .map(([key, value]) => `${key}="${value}"`)
    .join(",");
  return labelPart.length > 0 ? `${name}{${labelPart}}` : name;
}

export interface MetricSnapshot {
  readonly counters: Readonly<Record<string, number>>;
  readonly histograms: Readonly<Record<string, { sum: number; count: number }>>;
}

export class PostgresRecorder implements MetricRecorder {
  readonly #sql: ObservabilitySql;
  readonly #counters = new Map<string, number>();
  readonly #histograms = new Map<string, { sum: number; count: number }>();

  constructor(sql: ObservabilitySql) {
    this.#sql = sql;
  }

  #increment(name: string, labels: Readonly<Record<string, string>>, by = 1): void {
    const key = metricKey(name, labels);
    this.#counters.set(key, (this.#counters.get(key) ?? 0) + by);
  }

  #observe(name: string, labels: Readonly<Record<string, string>>, valueMs: number): void {
    const key = metricKey(name, labels);
    const current = this.#histograms.get(key) ?? { sum: 0, count: 0 };
    this.#histograms.set(key, { sum: current.sum + valueMs, count: current.count + 1 });
  }

  async recordCall(record: ToolCallRecord): Promise<void> {
    // Metrics eerst (in-memory, altijd): observability-only.
    this.#increment("tool_calls_total", {
      tool: record.toolId,
      agent: record.agentId,
      status: record.status,
    });
    const latencyMs = Date.parse(record.finishedAt) - Date.parse(record.startedAt);
    if (Number.isFinite(latencyMs) && latencyMs >= 0) {
      this.#observe("tool_latency_ms", { tool: record.toolId }, latencyMs);
    }
    if (record.status === "DENIED") {
      this.#increment("tool_denied_total", {
        tool: record.toolId,
        reason: record.errorCode ?? "DENIED",
      });
    } else if (record.status === "ERROR" || record.status === "TIMEOUT") {
      this.#increment("tool_failures_total", {
        tool: record.toolId,
        errorCode: record.errorCode ?? record.status,
      });
    }

    // Persistentie (migratie 007) — non-fatal: fout wordt gelogd, niet gegooid.
    try {
      await this.#sql`
        INSERT INTO tool_call_records (
          execution_id, tenant_id, agent_id, session_id, tool_id,
          arguments_hash, status, risk_level, approval_id,
          result_summary, error_code, evidence_refs, started_at, finished_at
        )
        VALUES (
          ${record.executionId}::uuid,
          ${record.tenantId}::uuid,
          ${record.agentId},
          ${record.sessionId ?? null}::uuid,
          ${record.toolId},
          ${record.argumentsHash},
          ${record.status},
          ${record.riskLevel},
          ${record.approvalId ?? null},
          ${record.resultSummary.slice(0, 200)},
          ${record.errorCode ?? null},
          ${JSON.stringify(record.evidenceRefs)}::jsonb,
          ${record.startedAt}::timestamptz,
          ${record.finishedAt}::timestamptz
        )
      `;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[observability] tool_call_records write failed (non-fatal): ${message.slice(0, 200)}`);
    }
  }

  recordDiscovery(intentHash: string, agentId: string, toolCount: number): void {
    this.#increment("tool_discovery_calls_total", { agent: agentId });
    this.#observe("tools_per_discovery", { agent: agentId }, toolCount);
    void intentHash; // intent zelf wordt niet gelogd (geen PII); alleen count
  }

  /** Approval create → pending-teller (TASK 17-koppeling, integratie later). */
  recordApprovalPending(agentId: string, toolId: string): void {
    this.#increment("approval_pending_total", { agent: agentId, tool: toolId });
  }

  /** Approval reject → rejected-teller (TASK 17-koppeling, integratie later). */
  recordApprovalRejected(agentId: string, toolId: string): void {
    this.#increment("approval_rejected_total", { agent: agentId, tool: toolId });
  }

  /** Budget-stop (TASK 16-koppeling, integratie later). */
  recordBudgetExceeded(agentId: string, field: string): void {
    this.#increment("agent_budget_exceeded_total", { agent: agentId, field });
  }

  /** Employee-stap (TASK 15-koppeling, integratie later). */
  recordAgentStep(agentId: string, sessionId: string | null): void {
    this.#increment("agent_steps_total", { agent: agentId, session: sessionId ?? "none" });
  }

  /** Netwerk-call van een netwerk-adapter (http/research/calendar/crm). */
  recordExternalRequest(toolId: string): void {
    this.#increment("external_requests", { tool: toolId });
  }

  /** Kosten/tokens (model-calls) — waarden zijn niet PII. */
  recordAgentCost(agentId: string, tenantId: string, cost: number, tokens: number): void {
    this.#increment("agent_cost", { agent: agentId, tenant: tenantId }, cost);
    this.#increment("agent_tokens", { agent: agentId, tenant: tenantId }, tokens);
  }

  /** Snapshot voor tests/export — observability-only, nooit in het beslissingspad. */
  snapshot(): MetricSnapshot {
    return {
      counters: Object.fromEntries(this.#counters),
      histograms: Object.fromEntries(this.#histograms),
    };
  }
}
