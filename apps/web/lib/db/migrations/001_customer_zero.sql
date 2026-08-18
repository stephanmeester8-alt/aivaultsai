-- ============================================================
-- AIVaultsAI - Customer Zero
-- Migration: 001_customer_zero
--
-- Purpose:
-- Establish the persistence layer for the Customer Zero
-- conversational lead engine.
--
-- Flow:
-- visitor
--   -> conversation
--   -> message
--   -> lead event
--   -> lead
--   -> qualification
--   -> follow-up / appointment
--
-- Important:
-- - Lead Events are append-only.
-- - Contact data is only stored when voluntarily supplied.
-- - Qualification is an assessment, not proof of conversion.
-- - CONVERTED requires an observable business outcome.
-- ============================================================


-- ============================================================
-- UUID generation
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- ENUM TYPES
-- ============================================================

DO $$
BEGIN
  CREATE TYPE lead_status AS ENUM (
    'NEW',
    'QUALIFIED',
    'FOLLOW_UP',
    'CONVERTED',
    'DISQUALIFIED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
  CREATE TYPE lead_source AS ENUM (
    'website',
    'ai_assistant',
    'linkedin',
    'instagram',
    'organic_search',
    'direct',
    'referral',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
  CREATE TYPE lead_intent AS ENUM (
    'website',
    'ai_assistant',
    'lead_generation',
    'automation',
    'appointment',
    'general_inquiry',
    'unknown'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
  CREATE TYPE lead_event_type AS ENUM (
    'assistant_conversation_started',
    'assistant_commercial_intent_detected',
    'contact_information_provided',
    'contact_request_submitted',
    'appointment_request_submitted',
    'lead_created',
    'lead_qualified',
    'follow_up_requested'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
  CREATE TYPE lead_event_origin AS ENUM (
    'live_assistant',
    'contact_form',
    'appointment_flow',
    'manual',
    'system'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
  CREATE TYPE qualification_confidence AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
  CREATE TYPE appointment_status AS ENUM (
    'REQUESTED',
    'CONFIRMED',
    'CANCELLED',
    'COMPLETED',
    'NO_SHOW'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- CONVERSATIONS
--
-- One conversation represents one visitor interaction session.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source lead_source NOT NULL DEFAULT 'ai_assistant',

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  visitor_session_id TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT conversations_end_after_start
    CHECK (
      ended_at IS NULL
      OR ended_at >= started_at
    )
);


CREATE INDEX IF NOT EXISTS idx_conversations_source
  ON conversations(source);

CREATE INDEX IF NOT EXISTS idx_conversations_started_at
  ON conversations(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_visitor_session
  ON conversations(visitor_session_id);


-- ============================================================
-- CONVERSATION MESSAGES
--
-- Stores the actual conversational trace.
--
-- role is intentionally text rather than an enum so the
-- application can evolve without requiring a database migration
-- for every provider-specific role.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id UUID NOT NULL
    REFERENCES conversations(conversation_id)
    ON DELETE CASCADE,

  role TEXT NOT NULL,

  content TEXT NOT NULL,

  sequence_number INTEGER NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT conversation_messages_role_check
    CHECK (
      role IN (
        'user',
        'assistant',
        'system'
      )
    ),

  CONSTRAINT conversation_messages_sequence_positive
    CHECK (
      sequence_number > 0
    ),

  CONSTRAINT conversation_messages_unique_sequence
    UNIQUE (
      conversation_id,
      sequence_number
    )
);


CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation
  ON conversation_messages(
    conversation_id,
    sequence_number
  );


-- ============================================================
-- LEADS
--
-- A Lead represents identifiable commercial interest.
--
-- A lead may exist without qualification.
-- ============================================================

CREATE TABLE IF NOT EXISTS leads (
  lead_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id UUID
    REFERENCES conversations(conversation_id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status lead_status NOT NULL DEFAULT 'NEW',

  source lead_source NOT NULL DEFAULT 'ai_assistant',

  intent lead_intent NOT NULL DEFAULT 'unknown',

  -- Voluntarily supplied contact information.
  name TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,

  -- Structured business context.
  industry TEXT,
  company_size TEXT,

  problem TEXT,
  desired_outcome TEXT,
  current_process TEXT,

  preferred_contact_method TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT leads_email_length
    CHECK (
      email IS NULL
      OR char_length(email) <= 320
    ),

  CONSTRAINT leads_phone_length
    CHECK (
      phone IS NULL
      OR char_length(phone) <= 50
    )
);


CREATE INDEX IF NOT EXISTS idx_leads_status
  ON leads(status);

CREATE INDEX IF NOT EXISTS idx_leads_source
  ON leads(source);

CREATE INDEX IF NOT EXISTS idx_leads_intent
  ON leads(intent);

CREATE INDEX IF NOT EXISTS idx_leads_created_at
  ON leads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_conversation
  ON leads(conversation_id);

CREATE INDEX IF NOT EXISTS idx_leads_email
  ON leads(email);


-- ============================================================
-- LEAD EVENTS
--
-- Append-only evidence trail.
--
-- Events must not be silently rewritten.
-- Corrections are represented by new events.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id UUID
    REFERENCES leads(lead_id)
    ON DELETE SET NULL,

  conversation_id UUID
    REFERENCES conversations(conversation_id)
    ON DELETE SET NULL,

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  event_type lead_event_type NOT NULL,

  source lead_source NOT NULL,

  origin lead_event_origin NOT NULL,

  -- Optional reference to the message that produced
  -- the observable event.
  message_id UUID
    REFERENCES conversation_messages(message_id)
    ON DELETE SET NULL,

  -- Evidence/context associated with the event.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_lead_events_lead
  ON lead_events(lead_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_lead_events_conversation
  ON lead_events(conversation_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_lead_events_type
  ON lead_events(event_type);

CREATE INDEX IF NOT EXISTS idx_lead_events_occurred_at
  ON lead_events(occurred_at DESC);


-- ============================================================
-- LEAD QUALIFICATIONS
--
-- Historical qualification decisions.
--
-- We deliberately do NOT store only one mutable qualification
-- record. Every qualification decision remains traceable.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_qualifications (
  qualification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id UUID NOT NULL
    REFERENCES leads(lead_id)
    ON DELETE CASCADE,

  score INTEGER NOT NULL,

  confidence qualification_confidence NOT NULL,

  reason TEXT NOT NULL,

  qualified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  qualified_by TEXT NOT NULL,

  supporting_event_ids UUID[] NOT NULL DEFAULT '{}',

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lead_qualifications_score_range
    CHECK (
      score >= 0
      AND score <= 100
    ),

  CONSTRAINT lead_qualifications_reason_not_empty
    CHECK (
      char_length(trim(reason)) > 0
    ),

  CONSTRAINT lead_qualifications_qualified_by_not_empty
    CHECK (
      char_length(trim(qualified_by)) > 0
    ),

  CONSTRAINT lead_qualifications_supporting_events_not_empty
    CHECK (
      cardinality(supporting_event_ids) > 0
    )
);


CREATE INDEX IF NOT EXISTS idx_lead_qualifications_lead
  ON lead_qualifications(
    lead_id,
    qualified_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_lead_qualifications_score
  ON lead_qualifications(score);


-- ============================================================
-- APPOINTMENTS
--
-- Prepared for Sprint 2.
--
-- We can create appointment records now, but the AI must NOT
-- claim a slot is available until a real calendar integration
-- confirms availability.
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  appointment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id UUID NOT NULL
    REFERENCES leads(lead_id)
    ON DELETE CASCADE,

  conversation_id UUID
    REFERENCES conversations(conversation_id)
    ON DELETE SET NULL,

  status appointment_status NOT NULL DEFAULT 'REQUESTED',

  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,

  timezone TEXT,

  contact_method TEXT,

  notes TEXT,

  external_calendar_event_id TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT appointments_valid_time_range
    CHECK (
      scheduled_end IS NULL
      OR scheduled_start IS NULL
      OR scheduled_end > scheduled_start
    )
);


CREATE INDEX IF NOT EXISTS idx_appointments_lead
  ON appointments(lead_id);

CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON appointments(status);

CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_start
  ON appointments(scheduled_start);


-- ============================================================
-- UPDATED_AT TRIGGER
--
-- Keeps mutable records timestamped consistently.
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS conversations_set_updated_at
  ON conversations;

CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


DROP TRIGGER IF EXISTS leads_set_updated_at
  ON leads;

CREATE TRIGGER leads_set_updated_at
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


DROP TRIGGER IF EXISTS appointments_set_updated_at
  ON appointments;

CREATE TRIGGER appointments_set_updated_at
BEFORE UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- SECURITY / DESIGN NOTES
-- ============================================================

COMMENT ON TABLE conversations IS
  'Customer Zero conversational sessions.';

COMMENT ON TABLE conversation_messages IS
  'Immutable conversational trace associated with a conversation.';

COMMENT ON TABLE leads IS
  'Commercially relevant visitor information voluntarily supplied or observed through supported interactions.';

COMMENT ON TABLE lead_events IS
  'Append-only observable evidence for lead creation, qualification and follow-up.';

COMMENT ON TABLE lead_qualifications IS
  'Historical qualification assessments. A qualification is not proof of conversion.';

COMMENT ON TABLE appointments IS
  'Appointment requests and confirmed appointments. Availability must come from a real calendar integration.';


-- ============================================================
-- END OF MIGRATION
-- ============================================================