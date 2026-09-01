-- Autonomous AI Employee — work sessions
-- Apply after 003_prospect_run.sql (prospect_tenants) and 004_prospect_discovery.sql.
-- One session per tenant per session_key (e.g. per day) enforced by the
-- unique constraint: the morning trigger can never start a duplicate run.

CREATE TABLE IF NOT EXISTS employee_work_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES prospect_tenants(tenant_id) ON DELETE CASCADE,
  session_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED'
  )),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_work_sessions_tenant_key_unique UNIQUE (tenant_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_employee_sessions_tenant ON employee_work_sessions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_sessions_status ON employee_work_sessions(status, created_at);

CREATE TABLE IF NOT EXISTS employee_work_session_steps (
  step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES employee_work_sessions(session_id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_session_steps ON employee_work_session_steps(session_id, created_at);

DROP TRIGGER IF EXISTS employee_work_sessions_set_updated_at ON employee_work_sessions;
CREATE TRIGGER employee_work_sessions_set_updated_at BEFORE UPDATE ON employee_work_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
