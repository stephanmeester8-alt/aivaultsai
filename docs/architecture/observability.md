# Agent Tool Platform — Observability (TASK 24)

> Datum: 1 september 2026 · Branch: `release/attribution` · Volgt op de calendar write-tools (TASK 23).
> Doel (FASE 12): centrale metrics + tracing voor het Agent Tool Platform — **elke tool-call en elke agent-run is traceable**. Metrics zijn observability-only: ze beslissen nooit iets en mogen business-logica nooit breken (bestaand patroon: `assistant-funnel.ts` — "GA4 observability only — never decides anything; non-fatal").

---

## 1. Uitgangspunt: bestaande situatie (FACT)

- **Geen centrale metrics-laag** voor het agent-platform (geverifieerd): `scoring_metrics` (prospect-run, migratie 003) en SEO `metrics` zijn domein-specifiek; `gtag.ts` is GA4-marketing-observability met het "never affects business logic"-principe.
- **Wel al traceerbaar vandaag:** employee session-steps (`employee_work_session_steps`, 005), prospect-run manifests (SHA-256, 003/004), approval-events (in-memory, agent-core), budget usage-snapshot (TASK 16-ontwerp), `approvalId` in run-records.
- FASE 12-metricslijst (opdracht): `tool_calls_total, tool_failures_total, tool_latency, tool_denied_total, approval_pending_total, approval_rejected_total, agent_steps_total, agent_budget_exceeded_total, agent_cost, agent_tokens, external_requests`.
- TASK 7-ontwerp voegt toe: `tool_discovery_calls_total`, `tools_per_discovery` (tool-discovery.md §14).
- FASE 11-auditrecord (opdracht): executionId, tenantId, agentId, sessionId, toolId, argumentsHash, startedAt, finishedAt, status, riskLevel, approvalId, resultSummary, errorCode, evidenceRefs — **nooit** credentials.

**Gevolg (FACT):** de bouwstenen voor tracing bestaan verspreid; er ontbreekt één centrale, uniforme laag die elke tool-call registreert (het FASE 11-record) en de FASE 12-metrieken bijhoudt. TASK 24 formaliseert die laag.

## 2. Doel & principe

```text
ELKE TOOL-CALL:
  recorder.recordCall({ executionId, tenantId, agentId, sessionId, toolId,
                        argumentsHash, startedAt, finishedAt, status,
                        riskLevel, approvalId, resultSummary, errorCode, evidenceRefs })
  → counter/histogram-update (FASE 12) + tool_call_records-rij (migratie 007)

ELKE RUN:
  executionId/sessionId-correlatie via bestaande session-steps + run-manifests + approvalId

OBSERVABILITY-ONLY:
  metrics/recorder-fouten worden gelogd, NOOIT gegooid in het beslissingspad (non-fatal)
```

- **Observability is geen autorisatie en geen gate:** de recorder hangt náást de execution-flow; een recorder-fout verandert nooit een ALLOW/DENY-uitspraak.
- **Traceable = reproduceerbaar:** met `executionId`/`sessionId` zijn steps, approval, budget en resultaat achteraf volledig te reconstrueren.

## 3. Contract (copy-ready, `apps/web/lib/observability/metrics.ts`)

```ts
interface ToolCallRecord {                       // FASE 11-auditrecord (geformaliseerd)
  executionId: string;                           // uniek per tool-call
  tenantId: string;
  agentId: string;
  sessionId: string | null;
  toolId: string;
  argumentsHash: string;                         // SHA-256; NOOIT ruwe argumenten
  startedAt: string;
  finishedAt: string;
  status: "ALLOWED" | "DENIED" | "NOT_IMPLEMENTED" | "ERROR" | "TIMEOUT";
  riskLevel: RiskLevel;
  approvalId: string | null;
  resultSummary: string;                         // compact, ≤ 200 tekens, geen secrets
  errorCode: string | null;
  evidenceRefs: string[];                        // bv. runId, draftId, appointmentId
}

interface MetricRecorder {                       // injectable; default = NoopRecorder
  recordCall(record: ToolCallRecord): Promise<void> | void;   // non-fatal
  recordDiscovery(intentHash: string, agentId: string, toolCount: number): void; // TASK 7-koppeling
}
```

**Metrieken (FASE 12 + TASK 7):**

| Metriek | Type | Labels |
|---|---|---|
| `tool_calls_total` | counter | tool, agent, status |
| `tool_failures_total` | counter | tool, errorCode |
| `tool_latency_ms` | histogram | tool |
| `tool_denied_total` | counter | tool, reason (permission/disabled/approval/ssrf/tenant/budget) |
| `approval_pending_total` / `approval_rejected_total` | gauge/counter | agent, tool |
| `agent_steps_total` | counter | agent, session |
| `agent_budget_exceeded_total` | counter | agent, field (TASK 16) |
| `agent_cost` / `agent_tokens` | counter | agent, tenant |
| `external_requests` | counter | tool (network-adapters: http/research/calendar/crm) |
| `tool_discovery_calls_total` / `tools_per_discovery` | counter/histogram | agent (TASK 7) |

## 4. Tool-call-record-persistentie (migratie 007, voorstel)

```sql
CREATE TABLE IF NOT EXISTS tool_call_records (
  execution_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES prospect_tenants(tenant_id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  session_id      UUID,                              -- employee-sessie (nullable)
  tool_id         TEXT NOT NULL,
  arguments_hash  TEXT NOT NULL,                     -- SHA-256; geen ruwe argumenten
  status          TEXT NOT NULL CHECK (status IN
                    ('ALLOWED','DENIED','NOT_IMPLEMENTED','ERROR','TIMEOUT')),
  risk_level      TEXT NOT NULL,
  approval_id     TEXT,
  result_summary  TEXT NOT NULL DEFAULT '',          -- ≤ 200 tekens
  error_code      TEXT,
  evidence_refs   JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at      TIMESTAMPTZ NOT NULL,
  finished_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_call_records_tenant_time ON tool_call_records(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_call_records_tool_status ON tool_call_records(tool_id, status, started_at);
CREATE INDEX IF NOT EXISTS idx_tool_call_records_session ON tool_call_records(session_id);
```

- **Never secrets:** `arguments_hash` alleen; `result_summary` is compact en wordt door de callers zonder PII samengesteld (patroon: `{draftId}`, `{appointmentId}`, `{count}`).
- `approval_id` koppelt het record aan de ApprovalEngine (in-memory vandaag; persistentie-optie is deze tabel zelf).

## 5. Integratiepunten (implementatie later)

| Laag | Wijziging |
|---|---|
| `apps/web/lib/tool-registry/` | `ctx.recorder?: MetricRecorder` — elke adapter-call schrijft één record (wrap-functie `recordedCall`) |
| `registry-adapter.ts` (TASK 15) | DENY/APPROVAL_REQUIRED/NOT_IMPLEMENTED ook registreren (status + reden) |
| Budget (TASK 16) | `agent_budget_exceeded_total` bij budget-stop |
| Approval (TASK 17) | `approval_pending/rejected_total` bij create/reject |
| Discovery (TASK 7) | `recordDiscovery` in `discoverTools`-wrapper (niet in de pure functie) |
| Employee-orchestrator | `agent_steps_total` per company-stap (bestaat al als session-steps — nu ook metriek) |
| Recorder-impl. | `NoopRecorder` (default, tests) + `PostgresRecorder` (migratie 007) — non-fatal: `try/catch` + console.warn |

## 6. Fail-closed & gedrag

| Situatie | Gedrag |
|---|---|
| Recorder ontbreekt (geen injectie) | no-op — tool-call draait normaal (observability-only) |
| Recorder-fout (DB-down) | gelogd, NIET gegooid; beslissing (ALLOW/DENY) blijft staan |
| Secret in record | onmogelijk door contract: alleen argumentsHash + compacte resultSummary; testmatrix dwingt af |
| Metrics in beslissingspad | verboden: recorder hangt náást de gate, nooit ervoor |
| Run zonder record | indicatie van een bug in de wrap — detecteerbaar via `tool_calls_total`-correlatie |

## 7. Voorgestelde bestanden (implementatie later)

- `apps/web/lib/observability/metrics.ts` — `ToolCallRecord`, `MetricRecorder`, `NoopRecorder`
- `apps/web/lib/observability/postgres-recorder.ts` — `PostgresRecorder` (migratie 007)
- `apps/web/lib/db/migrations/007_tool_call_records.sql` — §4
- `apps/web/lib/tool-registry/recorded-call.ts` — wrap-functie (start/finish/status)
- `apps/web/test/observability.test.ts` — testmatrix §8

## 8. Testmatrix (FASE 18-aanvulling)

ALLOWED-call → record + counter · DENIED (permission/disabled/ssrf/tenant/budget) → record + `tool_denied_total` · NOT_IMPLEMENTED → record · ERROR/TIMEOUT → record + `tool_failures_total` · approval create/reject → pending/rejected-tellers · budget-stop → `agent_budget_exceeded_total` · discovery → `tool_discovery_calls_total`/`tools_per_discovery` · recorder-fout → non-fatal (call slaagt) · NoopRecorder default (tests) · secrets nooit in record (argumentsHash only, compacte summary) · executionId uniek (concurrent) · correlatie sessionId/approvalId · bestaande tests groen (recorder optioneel).

## 9. Consequenties

- TASK 25 (tenant-policies): metrics krijgen tenant-labels; per-tenant dashboards.
- TASK 26 (e2e): de e2e-keten valideert dat elke stap een tool-call-record oplevert (traceability-assertie).
- Toekomstig: counters exporteren naar een metrics-backend (bv. Prometheus/OTel) via dezelfde `MetricRecorder`-interface — geen vendor-lock-in.
