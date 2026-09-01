-- Prospect-Run & B2B Client Acquisition Agent
-- Apply after 001_customer_zero.sql and 002_agent_runtime.sql.
-- All email actions remain subject to application policy and audit logging.

CREATE TABLE IF NOT EXISTS prospect_tenants (
  tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  commercial_mode TEXT NOT NULL DEFAULT 'CREDITS'
    CHECK (commercial_mode IN ('CREDITS', 'BYOK')),
  byok_key_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prospect_tenants_byok_reference
    CHECK (commercial_mode <> 'BYOK' OR byok_key_reference IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS prospect_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES prospect_tenants(tenant_id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(lead_id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'INTAKE', 'ANALYZING', 'QUALIFIED', 'ROUTED', 'DRAFTED',
    'AWAITING_REVIEW', 'QUEUED', 'SENT', 'BLOCKED', 'FAILED'
  )),
  dispatch_mode TEXT NOT NULL CHECK (dispatch_mode IN ('HUMAN_REVIEW', 'AUTO_SEND')),
  prospect_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  route TEXT CHECK (route IN ('SOVEREIGN_LOCAL_AI', 'BYOK_COST_REDUCTION', 'HITL_COMPLIANCE')),
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_prospect_runs_dispatch ON prospect_runs(state, dispatch_mode, created_at);
CREATE INDEX IF NOT EXISTS idx_prospect_runs_tenant ON prospect_runs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS scoring_metrics (
  metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES prospect_runs(run_id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  evidence TEXT[] NOT NULL DEFAULT '{}',
  uncertainty TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_sequences (
  sequence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES prospect_runs(run_id) ON DELETE CASCADE,
  recipient_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('DRAFT', 'AWAITING_REVIEW', 'QUEUED', 'SENT', 'DELIVERED', 'REPLIED', 'OPTED_OUT', 'FAILED', 'BLOCKED')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  provider_message_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_sequences_run ON email_sequences(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_sequences_state ON email_sequences(state, created_at);

CREATE TABLE IF NOT EXISTS prospect_opt_outs (
  recipient_hash TEXT PRIMARY KEY,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS audit_manifests (
  manifest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES prospect_runs(run_id) ON DELETE CASCADE,
  manifest_type TEXT NOT NULL,
  manifest JSONB NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_manifests_run ON audit_manifests(run_id, created_at);

DROP TRIGGER IF EXISTS prospect_runs_set_updated_at ON prospect_runs;
CREATE TRIGGER prospect_runs_set_updated_at BEFORE UPDATE ON prospect_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS email_sequences_set_updated_at ON email_sequences;
CREATE TRIGGER email_sequences_set_updated_at BEFORE UPDATE ON email_sequences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
