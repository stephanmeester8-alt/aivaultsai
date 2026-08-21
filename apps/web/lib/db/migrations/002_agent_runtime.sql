-- ============================================================
-- AIVaultsAI - Agent Runtime
-- Migration: 002_agent_runtime
--
-- Purpose:
-- Persistence for the agent runtime (TASK 22): agent runs and the
-- domain artifacts they produce (tasks, approvals, executions,
-- evidence, handoffs).
--
-- Design:
-- - agent_runs          : append-only state-transition log per run
-- - runtime_tasks       : task snapshots
-- - runtime_approvals   : approval decisions
-- - runtime_executions  : execution results (hashes only, no raw
--                         input/output; no secrets)
-- - runtime_evidence    : evidence records
-- - runtime_handoffs    : structured handoffs
--
-- Important:
-- - All tables are idempotent (IF NOT EXISTS).
-- - No destructive migration: existing tables are never altered.
-- - Raw input/output of tool executions are NEVER stored; only
--   SHA-256 hashes and summary fields are persisted.
-- ============================================================


-- ============================================================
-- AGENT RUNS
--
-- One row per state transition of an agent run (append-only).
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  external_run_id TEXT NOT NULL,

  state TEXT NOT NULL,

  task_id TEXT,

  agent_id TEXT,

  tool_id TEXT,

  reason TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_runs_external_run_id_not_empty
    CHECK (char_length(trim(external_run_id)) > 0),

  CONSTRAINT agent_runs_state_not_empty
    CHECK (char_length(trim(state)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_external_run
  ON agent_runs(external_run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_runs_state
  ON agent_runs(state);

CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at
  ON agent_runs(created_at DESC);


-- ============================================================
-- RUNTIME TASKS
--
-- Snapshot per task (created by the runtime on submit).
-- ============================================================

CREATE TABLE IF NOT EXISTS runtime_tasks (
  task_id TEXT PRIMARY KEY,

  -- External run id (agent-core runId), not a FK: the recorder writes the
  -- run transition row and child artifacts with the same stable id.
  run_id TEXT NOT NULL,

  title TEXT,

  objective TEXT NOT NULL,

  status TEXT NOT NULL,

  priority INTEGER,

  risk_level TEXT,

  assigned_to TEXT,

  expected_output TEXT,

  failure_reason TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT runtime_tasks_objective_not_empty
    CHECK (char_length(trim(objective)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_runtime_tasks_run
  ON runtime_tasks(run_id);

CREATE INDEX IF NOT EXISTS idx_runtime_tasks_status
  ON runtime_tasks(status);


-- ============================================================
-- RUNTIME APPROVALS
--
-- Approval lifecycle decisions per run.
-- ============================================================

CREATE TABLE IF NOT EXISTS runtime_approvals (
  approval_id TEXT PRIMARY KEY,

  -- External run id (agent-core runId), not a FK: the recorder writes the
  -- run transition row and child artifacts with the same stable id.
  run_id TEXT NOT NULL,

  task_id TEXT,

  requested_action TEXT NOT NULL,

  risk_level TEXT NOT NULL,

  requested_by TEXT NOT NULL,

  approved_by TEXT,

  status TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_runtime_approvals_run
  ON runtime_approvals(run_id);

CREATE INDEX IF NOT EXISTS idx_runtime_approvals_status
  ON runtime_approvals(status);


-- ============================================================
-- RUNTIME EXECUTIONS
--
-- Execution results. NEVER stores raw input or output; only
-- SHA-256 hashes and summary fields. execution_occurred must be
-- true exactly when a tool adapter actually ran.
-- ============================================================

CREATE TABLE IF NOT EXISTS runtime_executions (
  execution_id TEXT PRIMARY KEY,

  -- External run id (agent-core runId), not a FK: the recorder writes the
  -- run transition row and child artifacts with the same stable id.
  run_id TEXT NOT NULL,

  task_id TEXT,

  tool_id TEXT NOT NULL,

  status TEXT NOT NULL,

  execution_occurred BOOLEAN NOT NULL DEFAULT FALSE,

  error TEXT,

  input_hash TEXT,

  output_hash TEXT,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_runtime_executions_run
  ON runtime_executions(run_id);

CREATE INDEX IF NOT EXISTS idx_runtime_executions_status
  ON runtime_executions(status);


-- ============================================================
-- RUNTIME EVIDENCE
--
-- Append-only evidence records created by the runtime.
-- ============================================================

CREATE TABLE IF NOT EXISTS runtime_evidence (
  evidence_id TEXT PRIMARY KEY,

  -- External run id (agent-core runId), not a FK: the recorder writes the
  -- run transition row and child artifacts with the same stable id.
  run_id TEXT NOT NULL,

  task_id TEXT,

  claim TEXT NOT NULL,

  type TEXT NOT NULL,

  confidence TEXT NOT NULL,

  source TEXT,

  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,

  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT runtime_evidence_claim_not_empty
    CHECK (char_length(trim(claim)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_runtime_evidence_run
  ON runtime_evidence(run_id);

CREATE INDEX IF NOT EXISTS idx_runtime_evidence_type
  ON runtime_evidence(type);


-- ============================================================
-- RUNTIME HANDOFFS
--
-- Structured handoffs between agents.
-- ============================================================

CREATE TABLE IF NOT EXISTS runtime_handoffs (
  handoff_id TEXT PRIMARY KEY,

  -- External run id (agent-core runId), not a FK: the recorder writes the
  -- run transition row and child artifacts with the same stable id.
  run_id TEXT NOT NULL,

  task_id TEXT,

  from_agent TEXT NOT NULL,

  to_agent TEXT NOT NULL,

  objective TEXT NOT NULL,

  recommended_next_action TEXT,

  findings JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT runtime_handoffs_objective_not_empty
    CHECK (char_length(trim(objective)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_runtime_handoffs_run
  ON runtime_handoffs(run_id);

CREATE INDEX IF NOT EXISTS idx_runtime_handoffs_to_agent
  ON runtime_handoffs(to_agent);


-- ============================================================
-- SECURITY / DESIGN NOTES
-- ============================================================

COMMENT ON TABLE agent_runs IS
  'Append-only state-transition log for agent runs.';

COMMENT ON TABLE runtime_tasks IS
  'Task snapshots created by the agent runtime.';

COMMENT ON TABLE runtime_approvals IS
  'Approval lifecycle decisions per run.';

COMMENT ON TABLE runtime_executions IS
  'Execution results; only SHA-256 hashes of input/output, never raw values.';

COMMENT ON TABLE runtime_evidence IS
  'Append-only evidence records from the runtime.';

COMMENT ON TABLE runtime_handoffs IS
  'Structured handoffs between agents.';


-- ============================================================
-- END OF MIGRATION
-- ============================================================
