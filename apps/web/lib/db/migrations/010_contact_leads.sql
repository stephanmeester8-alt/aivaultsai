-- AIVaultsAI — contact leads (MVP lead workflow)
-- Apply after 009 (vereist pgcrypto + set_updated_at uit 001).
--
-- Let op: de bestaande `leads`-tabel (migratie 001) is conversation-gedreven
-- (Customer Zero assistant-funnel) met een ander schema. Deze formulier-leads
-- krijgen een EIGEN tabel `contact_leads` — conflictvrij en zonder de
-- bestaande flow te raken.
--
-- Beveiliging: er is GEEN publieke schrijf-toegang. De browser schrijft
-- nooit direct naar deze tabel; alleen de server-API (POST /api/leads) met
-- server-only credentials voegt rijen toe.
--
-- Idempotent en non-destructief: geen DROP, geen reset, geen deletes.

CREATE TABLE IF NOT EXISTS contact_leads (
  lead_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  email        TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  phone        TEXT CHECK (phone IS NULL OR char_length(phone) BETWEEN 1 AND 40),
  company      TEXT CHECK (company IS NULL OR char_length(company) BETWEEN 1 AND 200),

  -- Vaste dienst-selectie uit het formulier (fail-closed whitelist).
  service      TEXT NOT NULL CHECK (service IN
                 ('ai-assistent','ai-website','automatisering','anders')),

  message      TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),

  -- Lead-status (later uit te breiden; extensie = migratie).
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN
                 ('new','contacted','qualified','proposal','won','lost')),

  source       TEXT NOT NULL DEFAULT 'website',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_leads_created
  ON contact_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_leads_status
  ON contact_leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_leads_email
  ON contact_leads(email);

DROP TRIGGER IF EXISTS contact_leads_set_updated_at ON contact_leads;
CREATE TRIGGER contact_leads_set_updated_at BEFORE UPDATE ON contact_leads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
