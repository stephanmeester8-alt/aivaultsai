-- Lead Intelligence Engine: first evidence-backed website vertical slice.
-- Apply after 013_prospect_pipeline.sql. Additive evidence and scoring model only.

-- Required before composite tenant foreign keys are declared below.
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_tenant_company
  ON companies(tenant_id, company_id);

CREATE TABLE IF NOT EXISTS lead_signals (
  signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES prospect_tenants(tenant_id),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  prospect_run_id UUID REFERENCES prospect_runs(run_id),
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'HIRING_CUSTOMER_SERVICE', 'HIRING_PLANNER', 'HIRING_SALES_SUPPORT',
    'HIRING_RECRUITER', 'HIGH_MANUAL_INTAKE', 'WHATSAPP_INTAKE',
    'MULTIPLE_SERVICES', 'APPOINTMENT_FRICTION', 'SUPPORT_FRICTION',
    'NEW_LOCATION', 'BUSINESS_EXPANSION', 'NEW_SERVICE', 'HIGH_FAQ_LOAD',
    'URGENT_SERVICE', 'PAID_TRAFFIC', 'NO_CONVERSATIONAL_INTAKE'
  )),
  confidence SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  observed_at TIMESTAMPTZ NOT NULL,
  source_class TEXT NOT NULL,
  source_url TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK (verification_status IN ('VERIFIED', 'UNVERIFIED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_signals_observation_unique
    UNIQUE (tenant_id, company_id, signal_type, source_url, observed_at),
  CONSTRAINT lead_signals_tenant_company_fk
    FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, company_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_signals_tenant_signal
  ON lead_signals(tenant_id, signal_id);

CREATE TABLE IF NOT EXISTS lead_evidence (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES prospect_tenants(tenant_id),
  signal_id UUID NOT NULL REFERENCES lead_signals(signal_id) ON DELETE CASCADE,
  evidence_summary TEXT NOT NULL,
  source_url TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  source_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_evidence_source_unique UNIQUE (tenant_id, signal_id, source_hash),
  CONSTRAINT lead_evidence_tenant_signal_fk
    FOREIGN KEY (tenant_id, signal_id) REFERENCES lead_signals(tenant_id, signal_id)
);

CREATE TABLE IF NOT EXISTS lead_opportunities (
  opportunity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES prospect_tenants(tenant_id),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  prospect_run_id UUID REFERENCES prospect_runs(run_id),
  status TEXT NOT NULL CHECK (status IN ('REJECTED', 'SIGNAL_QUALIFIED', 'SALES_OPPORTUNITY')),
  why_now TEXT NOT NULL,
  observed_pain TEXT NOT NULL,
  recommended_solution TEXT NOT NULL,
  icp_score SMALLINT NOT NULL CHECK (icp_score BETWEEN 0 AND 100),
  pain_score SMALLINT NOT NULL CHECK (pain_score BETWEEN 0 AND 100),
  signal_score SMALLINT NOT NULL CHECK (signal_score BETWEEN 0 AND 100),
  automation_fit_score SMALLINT NOT NULL CHECK (automation_fit_score BETWEEN 0 AND 100),
  evidence_quality_score SMALLINT NOT NULL CHECK (evidence_quality_score BETWEEN 0 AND 100),
  opportunity_score SMALLINT NOT NULL CHECK (opportunity_score BETWEEN 0 AND 100),
  scoring_version TEXT NOT NULL,
  scored_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_opportunities_snapshot_unique
    UNIQUE (tenant_id, company_id, prospect_run_id, scoring_version),
  CONSTRAINT lead_opportunities_tenant_company_fk
    FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_signals_company
  ON lead_signals(tenant_id, company_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_opportunities_ranked
  ON lead_opportunities(tenant_id, status, opportunity_score DESC);
