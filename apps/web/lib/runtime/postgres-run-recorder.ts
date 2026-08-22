/**
 * Postgres implementation of the agent runtime recorder (TASK 22).
 *
 * Consumes the same append-only entry contract as the agent-core
 * RunRecorder port (structurally identical; agent-core is not imported here
 * to keep the Next.js build independent of the agent-core package).
 *
 * Writes:
 * - agent_runs          : run state transitions
 * - runtime_tasks       : task snapshots
 * - runtime_approvals   : approval decisions
 * - runtime_executions  : execution summaries (hashes only)
 * - runtime_evidence    : evidence records
 * - runtime_handoffs    : structured handoffs
 *
 * A failed write is logged and swallowed: the recorder must never break the
 * agent run it observes.
 */

export type RuntimeSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export type RunRecordKind = "run" | "task" | "execution" | "evidence" | "approval" | "handoff";

export interface RunRecordEntry {
  readonly runId: string;
  readonly state: string;
  readonly kind?: RunRecordKind;
  readonly taskId: string | null;
  readonly agentId: string | null;
  readonly toolId: string | null;
  readonly timestamp: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly data?: Readonly<Record<string, unknown>>;
}

export class PostgresRunRecorder {
  readonly #sql: RuntimeSql;

  constructor(sql: RuntimeSql) {
    this.#sql = sql;
  }

  async record(entry: RunRecordEntry): Promise<void> {
    try {
      const kind = entry.kind ?? "run";
      switch (kind) {
        case "run":
          await this.#recordRun(entry);
          break;
        case "task":
          await this.#recordTask(entry);
          break;
        case "approval":
          await this.#recordApproval(entry);
          break;
        case "execution":
          await this.#recordExecution(entry);
          break;
        case "evidence":
          await this.#recordEvidence(entry);
          break;
        case "handoff":
          await this.#recordHandoff(entry);
          break;
      }
    } catch (error) {
      console.error(
        "[runtime-recorder] failed to record",
        error instanceof Error ? error.name : "unknown",
      );
    }
  }

  #recordRun(entry: RunRecordEntry): Promise<unknown[]> {
    return this.#sql`
      INSERT INTO agent_runs (
        external_run_id,
        state,
        task_id,
        agent_id,
        tool_id,
        reason,
        metadata
      )
      VALUES (
        ${entry.runId},
        ${entry.state},
        ${entry.taskId ?? null},
        ${entry.agentId ?? null},
        ${entry.toolId ?? null},
        ${String(entry.meta?.reason ?? "")},
        ${JSON.stringify(entry.meta ?? {})}::jsonb
      )
    `;
  }

  #recordTask(entry: RunRecordEntry): Promise<unknown[]> {
    const data = entry.data ?? {};
    return this.#sql`
      INSERT INTO runtime_tasks (
        task_id,
        run_id,
        title,
        objective,
        status,
        priority,
        risk_level,
        assigned_to,
        expected_output,
        failure_reason,
        metadata
      )
      VALUES (
        ${entry.taskId ?? null},
        ${entry.runId},
        ${data.title ?? null},
        ${data.objective ?? ""},
        ${data.status ?? entry.state},
        ${data.priority ?? null},
        ${data.riskLevel ?? null},
        ${data.assignedTo ?? null},
        ${data.expectedOutput ?? null},
        ${data.failureReason ?? null},
        ${JSON.stringify(entry.meta ?? {})}::jsonb
      )
    `;
  }

  #recordApproval(entry: RunRecordEntry): Promise<unknown[]> {
    const data = entry.data ?? {};
    return this.#sql`
      INSERT INTO runtime_approvals (
        approval_id,
        run_id,
        task_id,
        requested_action,
        risk_level,
        requested_by,
        approved_by,
        status,
        resolved_at,
        metadata
      )
      VALUES (
        ${data.approvalId ?? null},
        ${entry.runId},
        ${entry.taskId ?? null},
        ${data.requestedAction ?? ""},
        ${data.riskLevel ?? ""},
        ${data.requestedBy ?? entry.agentId ?? ""},
        ${data.approver ?? null},
        ${data.decision ?? entry.state},
        NOW(),
        ${JSON.stringify(entry.meta ?? {})}::jsonb
      )
    `;
  }

  #recordExecution(entry: RunRecordEntry): Promise<unknown[]> {
    const data = entry.data ?? {};
    return this.#sql`
      INSERT INTO runtime_executions (
        execution_id,
        run_id,
        task_id,
        tool_id,
        status,
        execution_occurred,
        error,
        input_hash,
        output_hash,
        started_at,
        completed_at,
        metadata
      )
      VALUES (
        ${data.executionId ?? null},
        ${entry.runId},
        ${entry.taskId ?? null},
        ${entry.toolId ?? ""},
        ${data.status ?? entry.state},
        ${data.executionOccurred === true},
        ${data.error ?? null},
        ${data.inputHash ?? null},
        ${data.outputHash ?? null},
        NOW(),
        NOW(),
        ${JSON.stringify(entry.meta ?? {})}::jsonb
      )
    `;
  }

  #recordEvidence(entry: RunRecordEntry): Promise<unknown[]> {
    const data = entry.data ?? {};
    return this.#sql`
      INSERT INTO runtime_evidence (
        evidence_id,
        run_id,
        task_id,
        claim,
        type,
        confidence,
        source,
        provenance,
        collected_at,
        metadata
      )
      VALUES (
        ${data.evidenceId ?? null},
        ${entry.runId},
        ${entry.taskId ?? null},
        ${data.claim ?? ""},
        ${data.type ?? "UNKNOWN"},
        ${data.confidence ?? "UNKNOWN"},
        ${data.source ?? null},
        ${JSON.stringify(data.provenance ?? {})}::jsonb,
        NOW(),
        ${JSON.stringify(entry.meta ?? {})}::jsonb
      )
    `;
  }

  #recordHandoff(entry: RunRecordEntry): Promise<unknown[]> {
    const data = entry.data ?? {};
    return this.#sql`
      INSERT INTO runtime_handoffs (
        handoff_id,
        run_id,
        task_id,
        from_agent,
        to_agent,
        objective,
        recommended_next_action,
        findings,
        metadata
      )
      VALUES (
        ${data.handoffId ?? null},
        ${entry.runId},
        ${entry.taskId ?? null},
        ${data.fromAgent ?? ""},
        ${data.toAgent ?? ""},
        ${data.objective ?? ""},
        ${data.recommendedNextAction ?? null},
        ${JSON.stringify(data.findings ?? [])}::jsonb,
        ${JSON.stringify(entry.meta ?? {})}::jsonb
      )
    `;
  }
}

/** Convenience factory using the shared DB client (lazy import keeps tests pure). */
export async function createDefaultPostgresRunRecorder(): Promise<PostgresRunRecorder> {
  const { sql } = await import("../db/client");
  return new PostgresRunRecorder(sql as unknown as RuntimeSql);
}
