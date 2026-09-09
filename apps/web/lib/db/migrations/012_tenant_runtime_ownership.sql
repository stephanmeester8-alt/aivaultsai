-- Sprint 4 — Tenant ownership 002-runtime-tabellen (audit → hardening)
-- Apply after 011 (vereist prospect_tenants uit 003 en het 011-patroon).
--
-- Audit (Sprint 4): agent_runs, runtime_tasks, runtime_approvals,
-- runtime_executions, runtime_evidence en runtime_handoffs beschrijven
-- klant-/tenant-executie-data (post-lead runs per conversatie, employee-
-- approval-records, tool-executions). Er bestaat GEEN system-globale run in
-- het huidige product: elke run hoort bij een tenant (site-tenant of een
-- expliciete tenant). Daarom worden alle zes tabellen tenant-scoped —
-- system-global blijven zou hier niet aantoonbaar correct zijn.
--
-- Geen tweede tenancy-model: tenant_id UUID REFERENCES prospect_tenants,
-- zelfde patroon als migratie 011 (idempotent, niet-destructief).
--
-- Veilige volgorde per tabel:
--   1. kolom tijdelijk NULLABLE toevoegen
--   2. bestaande records deterministisch backfillen naar de site-tenant
--   3. FK + index toevoegen
--   4. NOT NULL afdwingen
--
-- Site-tenant (deterministisch, zelfde constante als lib/tenancy.ts):
--   11111111-1111-4111-8111-111111111111  (AIVaultsAI)

-- 0) Zorg dat de site-tenant bestaat (idempotent).
INSERT INTO prospect_tenants (tenant_id, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'AIVaultsAI')
ON CONFLICT (tenant_id) DO NOTHING;

-- 1) agent_runs --------------------------------------------------------------
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE agent_runs SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE agent_runs ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant
  ON agent_runs(tenant_id, created_at DESC);

-- 2) runtime_tasks ------------------------------------------------------------
ALTER TABLE runtime_tasks
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE runtime_tasks SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE runtime_tasks ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_runtime_tasks_tenant
  ON runtime_tasks(tenant_id, created_at DESC);

-- 3) runtime_approvals ---------------------------------------------------------
ALTER TABLE runtime_approvals
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE runtime_approvals SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE runtime_approvals ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_runtime_approvals_tenant
  ON runtime_approvals(tenant_id, created_at DESC);

-- 4) runtime_executions --------------------------------------------------------
ALTER TABLE runtime_executions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE runtime_executions SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE runtime_executions ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_runtime_executions_tenant
  ON runtime_executions(tenant_id, started_at DESC);

-- 5) runtime_evidence ----------------------------------------------------------
ALTER TABLE runtime_evidence
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE runtime_evidence SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE runtime_evidence ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_runtime_evidence_tenant
  ON runtime_evidence(tenant_id, collected_at DESC);

-- 6) runtime_handoffs ----------------------------------------------------------
ALTER TABLE runtime_handoffs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE runtime_handoffs SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE runtime_handoffs ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_runtime_handoffs_tenant
  ON runtime_handoffs(tenant_id, created_at DESC);

-- Referentiële consistentie (rapportage per tabel; FK-constraints hierboven
-- toegevoegd via REFERENCES — geen rijen verwijderd).
