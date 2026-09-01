-- Agent Tool Platform — email drafts (TASK 18, email-draft-tool.md §5)
-- Apply after 005_employee_work_sessions.sql.
-- Idempotente draft-opslag: één rij per (tenant_id, session_id, action_id).
-- Status SENT wordt alleen door email_send (TASK 19) gezet, na approval.

CREATE TABLE IF NOT EXISTS email_drafts (
  draft_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES prospect_tenants(tenant_id) ON DELETE CASCADE,
  session_id    UUID,                          -- employee-sessie (nullable: ook losse calls)
  action_id     TEXT,                          -- employee-actie (nullable)
  to_address    TEXT NOT NULL,
  subject       TEXT NOT NULL CHECK (char_length(subject) <= 200),
  body          TEXT NOT NULL CHECK (char_length(body) <= 5000),
  opt_out_line  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','SENT','CANCELLED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_drafts_session_action_unique UNIQUE (tenant_id, session_id, action_id)
);

CREATE INDEX IF NOT EXISTS idx_email_drafts_tenant ON email_drafts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_drafts_status ON email_drafts(status, created_at);

DROP TRIGGER IF EXISTS email_drafts_set_updated_at ON email_drafts;
CREATE TRIGGER email_drafts_set_updated_at BEFORE UPDATE ON email_drafts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
