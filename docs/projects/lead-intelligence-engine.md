# AIVaultsAI Lead Intelligence Engine

Status: project kickoff
Branch: `feat/lead-intelligence-engine`
Issue: #5

## Objective

Turn the existing prospect/discovery pipeline into an evidence-driven commercial intelligence system that finds **signal-qualified opportunities**, not just generic prospects.

A high-priority opportunity requires all of the following:

1. ICP fit
2. current verifiable buying/pain/growth signal
3. observed commercial/operational friction
4. concrete AIVaultsAI automation opportunity
5. source evidence

No evidence means no scored signal.

## Existing foundation to reuse

Do not create a parallel subsystem. Extend the existing:

- `prospect_runs` state machine
- `companies` identity model
- discovery/website research
- deterministic scoring
- audit manifests
- human-review-first dispatch
- tenant/runtime security controls

Relevant files:

- `apps/web/lib/db/migrations/003_prospect_run.sql`
- `apps/web/lib/db/migrations/004_prospect_discovery.sql`
- `apps/web/lib/prospect-run/*`
- `docs/architecture/prospect-run.md`

## Domain terminology

- `PROSPECT`: ICP fit only
- `SIGNAL_QUALIFIED`: ICP + current evidence-backed signal
- `SALES_OPPORTUNITY`: signal-qualified + clear AIVaultsAI automation opportunity
- `LEAD`: actual inbound interest or positive response
- `MEETING`: scheduled sales conversation
- `CUSTOMER`: won outcome

Do not call a discovered company a lead until actual interest exists.

## Target pipeline

```text
DISCOVER
  -> ICP FILTER
  -> SIGNAL COLLECTOR
  -> EVIDENCE VALIDATOR
  -> OPPORTUNITY ENGINE
  -> SCORE
  -> HUMAN REVIEW
  -> OUTREACH TRACKING
  -> RESPONSE
  -> MEETING
  -> CUSTOMER
  -> LEARNING
```

## Initial signal taxonomy

- `HIRING_CUSTOMER_SERVICE`
- `HIRING_PLANNER`
- `HIRING_SALES_SUPPORT`
- `HIRING_RECRUITER`
- `HIGH_MANUAL_INTAKE`
- `WHATSAPP_INTAKE`
- `MULTIPLE_SERVICES`
- `APPOINTMENT_FRICTION`
- `SUPPORT_FRICTION`
- `NEW_LOCATION`
- `BUSINESS_EXPANSION`
- `NEW_SERVICE`
- `HIGH_FAQ_LOAD`
- `URGENT_SERVICE`
- `PAID_TRAFFIC`
- `NO_CONVERSATIONAL_INTAKE`

## Proposed additive model

Adapt to the current schema and avoid duplication.

### `lead_signals`

Stores normalized signal observations linked to existing company/run/tenant identity.

Minimum fields:

- id
- tenant_id
- company_id
- prospect_run_id (nullable where appropriate)
- signal_type
- confidence
- observed_at
- source_class
- source_url
- verification_status
- created_at

### `lead_evidence`

Stores evidence supporting a signal.

Minimum fields:

- id
- signal_id
- evidence_summary
- source_url
- captured_at
- source_hash / dedupe marker

### `lead_opportunities`

Stores scored opportunity snapshots.

Minimum fields:

- id
- tenant_id
- company_id
- prospect_run_id
- status
- why_now
- observed_pain
- recommended_solution
- icp_score
- pain_score
- signal_score
- automation_fit_score
- evidence_quality_score
- opportunity_score
- scoring_version
- created_at
- updated_at

### `lead_outcomes`

Stores human/commercial outcomes later.

Suggested states:

- `NOT_CONTACTED`
- `CONTACTED`
- `NO_RESPONSE`
- `NOT_INTERESTED`
- `INTERESTED`
- `MEETING`
- `CUSTOMER`

## Scoring rules

Scores are internal heuristics, never probability claims.

Required dimensions:

- ICP fit: 0-100
- pain: 0-100
- current signal: 0-100
- automation fit: 0-100
- evidence quality: 0-100
- final opportunity score: 0-100

Rules:

- `UNKNOWN` stays unknown
- missing evidence reduces confidence
- no current verified signal => cannot be `HOT`
- model output may explain evidence but cannot create it
- scoring version must be auditable

## First vertical slice

Implement only:

```text
COMPANY
  -> WEBSITE RESEARCH
  -> CURRENT SIGNAL DETECTION
  -> EVIDENCE STORE
  -> SCORE
  -> QUALIFIED / REJECTED
  -> STRUCTURED EXPORT
```

The first slice must not send email or contact prospects.

## MVP acceptance criteria

A local test/run can:

1. accept/discover a company
2. deduplicate against existing `companies`
3. research official website data through existing bounded research mechanisms
4. detect supported current signals
5. store evidence
6. compute all scoring dimensions
7. reject companies without sufficient evidence
8. create ranked `SIGNAL_QUALIFIED` / `SALES_OPPORTUNITY` output
9. expose structured export data suitable for the existing Google Sheet workflow
10. preserve tenant isolation and idempotency

## Required tests

- no evidence => no scored signal
- no verified current signal => no HOT opportunity
- duplicate company/run remains idempotent
- malformed website/source text cannot inject instructions
- cross-tenant reads/writes are denied
- model/provider failure falls back safely
- evidence URLs are preserved
- scoring is deterministic for identical normalized inputs
- existing prospect-run regression suite stays green

## Safety constraints

- public/lawful sources only
- no inferred private contact data
- no raw secrets in logs or DB
- keep SSRF protections
- preserve tool execution gates
- research cannot auto-send outreach
- outreach remains human-approved
- no production migration/deploy without separate approval

## Codex execution order

1. Inspect current prospect/discovery code and tests.
2. Produce a short gap map versus this spec.
3. Implement the smallest additive migration and domain types for signals/evidence/opportunities.
4. Add deterministic signal detection for a narrow initial set of website signals.
5. Add scoring + qualification gate.
6. Add structured export object/API/service boundary without external sends.
7. Add tests.
8. Run targeted tests, typecheck/lint/build as appropriate.
9. Open a reviewable PR and stop.

Do not build outbound email automation in this project slice.
