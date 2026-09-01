-- Prospect Discovery + Website Research + AI Assistant Detection
-- Apply after 001_customer_zero.sql, 002_agent_runtime.sql and 003_prospect_run.sql.
-- Companies are the discovery-level identity; prospect_runs (003) remain the
-- per-prospect pipeline records. Research/detection payloads are stored as
-- JSONB so the deterministic + AI layers stay versionable without schema churn.

CREATE TABLE IF NOT EXISTS companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  industry TEXT,
  location TEXT,
  discovery_source TEXT NOT NULL,
  website_research JSONB,
  ai_detection JSONB,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT companies_domain_unique UNIQUE (domain)
);

CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
CREATE INDEX IF NOT EXISTS idx_companies_source ON companies(discovery_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_last_checked ON companies(last_checked_at);

DROP TRIGGER IF EXISTS companies_set_updated_at ON companies;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
