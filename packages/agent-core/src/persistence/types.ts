/**
 * Persistence port for the agent runtime.
 *
 * agent-core stays free of any database implementation. A recorder is an
 * append-only audit sink: the runtime snapshots every state transition and
 * domain artifact (task, execution, evidence, approval, handoff) to it
 * (fire-and-forget; a failed write never breaks the run). The app layer
 * provides a Postgres implementation (see apps/web/lib/runtime).
 */

export const RUN_RECORD_KINDS = [
  "run",
  "task",
  "execution",
  "evidence",
  "approval",
  "handoff",
] as const;

export type RunRecordKind = (typeof RUN_RECORD_KINDS)[number];

export type RunRecordEntry = {
  readonly runId: string;
  readonly state: string;
  /** What kind of artifact this entry records. Defaults to "run". */
  readonly kind?: RunRecordKind;
  readonly taskId: string | null;
  readonly agentId: string | null;
  readonly toolId: string | null;
  readonly timestamp: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  /** Kind-specific payload (e.g. execution status, evidence id). */
  readonly data?: Readonly<Record<string, unknown>>;
};

export interface RunRecorder {
  record(entry: RunRecordEntry): Promise<void> | void;
}

/** No-op recorder: records nothing. Useful as a default. */
export class NoopRunRecorder implements RunRecorder {
  record(_entry: RunRecordEntry): void {
    /* no-op */
  }
}
