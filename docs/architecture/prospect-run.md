# Prospect-Run & B2B Client Acquisition Agent

Status: locally implemented and un-deployed. It is not exposed on the public site and it does not send email by default.

`INTAKE → ANALYZING → QUALIFIED → ROUTED → DRAFTED → AWAITING_REVIEW | QUEUED → SENT`

The `prospect_runs` conditional claim is the concurrency boundary. A worker may start only by changing an unlocked `INTAKE` run to `ANALYZING`; competing workers receive `RUN_ALREADY_CLAIMED`.

The model-facing intelligence stage receives sanitized public and CRM signals only. Formatting, propensity scoring, sales-route matching, and email templating are deterministic and separately auditable. Score is composed from commercial opportunity and evidence baseline, reduced by an uncertainty penalty. Unknown CRM/conversion data therefore reduces confidence rather than creating a false high score.

Dispatch is fail-closed: verified business email, no opt-out, domain warm-up, rate allowance, explicit auto-send mode, and a configured provider are all required. The default is `HUMAN_REVIEW`; the agent only creates a reviewable draft. `audit_manifests` stores a timestamped `run_manifest` JSON object and SHA-256 digest.

## Local deployment prerequisites

1. Apply migration `apps/web/lib/db/migrations/003_prospect_run.sql` after migrations 001 and 002.
2. Create a `prospect_tenants` row. BYOK stores a secret reference only; never store raw keys.
3. Set `PROSPECT_RUN_API_KEY` as a server-only environment variable and call the admin endpoint with a Bearer token.
4. Connect a compliant email provider implementation, a persistent/distributed rate limiter, domain warm-up telemetry, and an unsubscribe webhook before enabling `AUTO_SEND`.
5. Keep the dashboard behind authenticated administration; the component is deliberately not mounted on the public website.

No deployment is performed by this repository change.
