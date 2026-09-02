-- Agent Tool Platform — tool-call records (TASK 24, observability.md §4)
-- Apply after 006_email_drafts.sql.
-- Eén rij per tool-call (FASE 11-auditrecord): traceability van elke call.
-- NEVER SECRETS: alleen arguments_hash (SHA-256) en een compacte
-- result_summary (≤ 200 tekens) — nooit ruwe argumenten of PII.

CREATE TABLE IF NOT EXISTS tool_call_records (
  execution_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES prospect_tenants(tenant_id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  session_id      UUID,                              -- employee-sessie (nullable)
  tool_id         TEXT NOT NULL,
  arguments_hash  TEXT NOT NULL,                     -- SHA-256; geen ruwe argumenten
  status          TEXT NOT NULL CHECK (status IN
                    ('ALLOWED','DENIED','NOT_IMPLEMENTED','ERROR','TIMEOUT')),
  risk_level      TEXT NOT NULL,
  approval_id     TEXT,
  result_summary  TEXT NOT NULL DEFAULT '',          -- ≤ 200 tekens
  error_code      TEXT,
  evidence_refs   JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at      TIMESTAMPTZ NOT NULL,
  finished_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_call_records_tenant_time
  ON tool_call_records(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_call_records_tool_status
  ON tool_call_records(tool_id, status, started_at);
CREATE INDEX IF NOT EXISTS idx_tool_call_records_session
  ON tool_call_records(session_id);
