-- ============================================================
-- AIVaultsAI - Prospect Acquisition Pipeline (Fase 2-4, bounded scope)
-- Migration: 013_prospect_pipeline
--
-- Purpose:
--   Centrale prospectadministratie voor de acquisitieworkflow:
--     prospect -> outreach (1e e-mail / max 1 follow-up) -> reply (handmatig)
--   Alleen NIEUWE tabellen, enums, indexen en constraints. Bestaande
--   tabellen worden NIET gewijzigd, verwijderd of gereset. Additief en
--   idempotent (zelfde patroon als 001-012: IF NOT EXISTS / DO $$ ... EXCEPTION).
--
-- Tenant:
--   Alle rijen dragen tenant_id NOT NULL REFERENCES prospect_tenants
--   (canonical tenant, migratie 003). NO TENANT = NO RECORD.
--
-- Veiligheid:
--   - unieke constraints voorkomen dubbele prospects (genormaliseerd e-mail
--     en domein) en dubbele verzending (max 1 FIRST_EMAIL + max 1 FOLLOW_UP
--     per prospect);
--   - reply-classificatie slaat NOOIT volledige e-mailinhoud op;
--   - deze migratie verstuurt niets en benadert niemand.
-- ============================================================

-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$
BEGIN
  CREATE TYPE prospect_status AS ENUM (
    'NEW',
    'RESEARCHED',
    'READY_FOR_OUTREACH',
    'FIRST_EMAIL_SENT',
    'WAITING_FOR_REPLY',
    'REPLIED',
    'FOLLOW_UP_DUE',
    'FOLLOW_UP_DRAFTED',
    'CALL_DUE',
    'DEMO_OFFERED',
    'DEMO_SCHEDULED',
    'WON',
    'LOST',
    'DO_NOT_CONTACT',
    'BOUNCED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE prospect_reply_class AS ENUM (
    'INTERESTED',
    'QUESTION',
    'NOT_NOW',
    'NOT_INTERESTED',
    'UNSUBSCRIBE',
    'UNKNOWN'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE prospect_outreach_kind AS ENUM (
    'FIRST_EMAIL',
    'FOLLOW_UP'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE prospect_outreach_status AS ENUM (
    'DRAFT',
    'APPROVED',
    'SENT',
    'BOUNCED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- PROSPECTS
--
-- Eén rij per bedrijf/prospect. Duplicaten worden op database-niveau
-- geblokkeerd op genormaliseerd e-mailadres én genormaliseerd domein
-- (partial unique indexes: NULL-waarden tellen niet mee).
-- ============================================================

CREATE TABLE IF NOT EXISTS prospects (
  prospect_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL
    REFERENCES prospect_tenants(tenant_id)
    ON DELETE CASCADE,

  -- Kerngegevens
  company_name TEXT NOT NULL CHECK (char_length(trim(company_name)) BETWEEN 1 AND 300),
  industry TEXT,
  city TEXT,
  website TEXT CHECK (website IS NULL OR char_length(website) <= 500),
  email TEXT CHECK (email IS NULL OR char_length(email) <= 320),
  email_normalized TEXT,
  domain_normalized TEXT,
  phone TEXT CHECK (phone IS NULL OR char_length(phone) <= 50),

  -- Kwalificatie
  lead_score INTEGER CHECK (lead_score IS NULL OR (lead_score >= 0 AND lead_score <= 100)),
  priority TEXT CHECK (priority IS NULL OR priority IN ('LOW', 'MEDIUM', 'HIGH')),
  personalization_angle TEXT,
  source_url TEXT CHECK (source_url IS NULL OR char_length(source_url) <= 2048),

  -- Outreach-status
  status prospect_status NOT NULL DEFAULT 'NEW',
  contact_attempts INTEGER NOT NULL DEFAULT 0 CHECK (contact_attempts >= 0),
  first_email_sent_at TIMESTAMPTZ,
  gmail_message_id TEXT,
  last_contact_at TIMESTAMPTZ,
  next_action_at TIMESTAMPTZ,
  reply_status prospect_reply_class,
  do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT prospects_company_name_not_blank
    CHECK (char_length(trim(company_name)) > 0)
);

-- Genormaliseerde e-mail uniek per tenant (NULL = geen match).
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospects_tenant_email_normalized
  ON prospects(tenant_id, email_normalized)
  WHERE email_normalized IS NOT NULL;

-- Genormaliseerd domein uniek per tenant (NULL = geen match).
CREATE UNIQUE INDEX IF NOT EXISTS uq_prospects_tenant_domain_normalized
  ON prospects(tenant_id, domain_normalized)
  WHERE domain_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_tenant_status
  ON prospects(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_prospects_tenant_next_action
  ON prospects(tenant_id, next_action_at)
  WHERE next_action_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_tenant_created
  ON prospects(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospects_tenant_dnc
  ON prospects(tenant_id, do_not_contact)
  WHERE do_not_contact = TRUE;

-- ============================================================
-- PROSPECT_OUTREACH
--
-- Verzendadministratie per prospect. Uniek (prospect_id, kind):
--   - maximaal één FIRST_EMAIL per prospect (geen dubbele 1e e-mail);
--   - maximaal één FOLLOW_UP per prospect (regel: max 1 follow-up).
-- Verzending gebeurt NOOIT vanuit deze tabel zelf: status DRAFT ->
-- APPROVED -> (menselijke approval) -> SENT. Geen automatische verzending.
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_outreach (
  outreach_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL
    REFERENCES prospect_tenants(tenant_id)
    ON DELETE CASCADE,

  prospect_id UUID NOT NULL
    REFERENCES prospects(prospect_id)
    ON DELETE CASCADE,

  kind prospect_outreach_kind NOT NULL,
  status prospect_outreach_status NOT NULL DEFAULT 'DRAFT',

  to_address TEXT NOT NULL CHECK (char_length(trim(to_address)) BETWEEN 3 AND 320),
  from_address TEXT NOT NULL CHECK (char_length(trim(from_address)) BETWEEN 3 AND 320),
  subject TEXT NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),

  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT prospect_outreach_one_per_kind
    UNIQUE (prospect_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_prospect_outreach_tenant
  ON prospect_outreach(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_outreach_prospect
  ON prospect_outreach(prospect_id, kind);

CREATE INDEX IF NOT EXISTS idx_prospect_outreach_message
  ON prospect_outreach(gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospect_outreach_thread
  ON prospect_outreach(gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

-- ============================================================
-- PROSPECT_REPLIES
--
-- Handmatige reactie-inbox (v1, geen Gmail-API). Bevat NOOIT volledige
-- e-mailinhoud: alleen koppeling (message/thread-ID), classificatie en een
-- korte samenvatting. Automatische beantwoording bestaat niet.
-- ============================================================

CREATE TABLE IF NOT EXISTS prospect_replies (
  reply_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tenant_id UUID NOT NULL
    REFERENCES prospect_tenants(tenant_id)
    ON DELETE CASCADE,

  prospect_id UUID NOT NULL
    REFERENCES prospects(prospect_id)
    ON DELETE CASCADE,

  outreach_id UUID
    REFERENCES prospect_outreach(outreach_id)
    ON DELETE SET NULL,

  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  classification prospect_reply_class NOT NULL,
  summary TEXT CHECK (summary IS NULL OR char_length(summary) <= 1000),
  next_action TEXT CHECK (next_action IS NULL OR char_length(next_action) <= 2000),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_replies_tenant
  ON prospect_replies(tenant_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_replies_prospect
  ON prospect_replies(prospect_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_prospect_replies_message
  ON prospect_replies(gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospect_replies_thread
  ON prospect_replies(gmail_thread_id)
  WHERE gmail_thread_id IS NOT NULL;

-- ============================================================
-- UPDATED_AT TRIGGERS (hergebruikt de bestaande set_updated_at-functie
-- uit migratie 001; alleen gekoppeld aan de nieuwe tabellen)
-- ============================================================

DROP TRIGGER IF EXISTS prospects_set_updated_at ON prospects;
CREATE TRIGGER prospects_set_updated_at
BEFORE UPDATE ON prospects
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS prospect_outreach_set_updated_at ON prospect_outreach;
CREATE TRIGGER prospect_outreach_set_updated_at
BEFORE UPDATE ON prospect_outreach
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SECURITY / DESIGN NOTES
-- ============================================================

COMMENT ON TABLE prospects IS
  'Centrale prospectadministratie (acquisitie). Uniek per tenant op genormaliseerd e-mailadres en domein.';

COMMENT ON TABLE prospect_outreach IS
  'Verzendadministratie per prospect: max 1 eerste e-mail en max 1 follow-up. Verzending uitsluitend na menselijke approval.';

COMMENT ON TABLE prospect_replies IS
  'Handmatige reactie-registratie. Slaat nooit volledige e-mailinhoud op; alleen koppeling, classificatie en korte samenvatting.';

-- ============================================================
-- END OF MIGRATION
-- ============================================================
