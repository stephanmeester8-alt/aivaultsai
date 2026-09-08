-- Sprint 3 — Tenant Isolation Hardening (klantdata)
-- Apply after 010 (vereist prospect_tenants uit 003).
--
-- Canonical tenant-entiteit: prospect_tenants (zie lib/tenancy.ts).
-- Doel: alle klantgebonden data krijgt tenant_id IS NOT NULL + FK.
--
-- Veilige volgorde per tabel (geen destructieve reset, geen deletes):
--   1. kolom tijdelijk NULLABLE toevoegen
--   2. bestaande records deterministisch backfillen naar de site-tenant
--   3. FK + index toevoegen
--   4. tenant-aware unique waar semantisch nodig
--   5. NOT NULL afdwingen
--
-- Site-tenant (deterministisch, zelfde constante als lib/tenancy.ts):
--   11111111-1111-4111-8111-111111111111  (AIVaultsAI)

-- 0) Zorg dat de site-tenant bestaat (idempotent).
INSERT INTO prospect_tenants (tenant_id, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'AIVaultsAI')
ON CONFLICT (tenant_id) DO NOTHING;

-- 1) conversations --------------------------------------------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE conversations SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE conversations ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_tenant
  ON conversations(tenant_id, last_activity_at DESC);

-- 2) conversation_messages (child van conversations; tenant denormalized) --
ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE conversation_messages SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE conversation_messages ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversation_messages_tenant
  ON conversation_messages(tenant_id, conversation_id);

-- 3) leads -----------------------------------------------------------------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE leads SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE leads ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_tenant
  ON leads(tenant_id, created_at DESC);

-- 4) lead_events ------------------------------------------------------------
ALTER TABLE lead_events
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE lead_events SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE lead_events ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_events_tenant
  ON lead_events(tenant_id, created_at DESC);

-- 5) lead_qualifications -----------------------------------------------------
ALTER TABLE lead_qualifications
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE lead_qualifications SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE lead_qualifications ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_qualifications_tenant
  ON lead_qualifications(tenant_id, created_at DESC);

-- 6) appointments ------------------------------------------------------------
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE appointments SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE appointments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_tenant
  ON appointments(tenant_id, scheduled_start);

-- 7) contact_leads (010, formulier-leads) ------------------------------------
ALTER TABLE contact_leads
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE contact_leads SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE contact_leads ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_leads_tenant
  ON contact_leads(tenant_id, created_at DESC);

-- 8) companies (employee prospect-data; unique domain wordt tenant-aware) ----
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE companies SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE companies ALTER COLUMN tenant_id SET NOT NULL;
DO $$
BEGIN
  ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_domain_key;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
ALTER TABLE companies ADD CONSTRAINT companies_tenant_domain_unique
  UNIQUE (tenant_id, domain);
CREATE INDEX IF NOT EXISTS idx_companies_tenant
  ON companies(tenant_id, domain);

-- 9) employee_work_session_steps (child van employee_work_sessions) ----------
ALTER TABLE employee_work_session_steps
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);
UPDATE employee_work_session_steps SET tenant_id = '11111111-1111-4111-8111-111111111111'
 WHERE tenant_id IS NULL;
ALTER TABLE employee_work_session_steps ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_session_steps_tenant
  ON employee_work_session_steps(tenant_id, session_id);

-- Referentiële consistentie (rapportage per tabel; FK-constraints hierboven
-- toegevoegd via REFERENCES — geen rijen verwijderd).
