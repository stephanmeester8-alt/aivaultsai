# Implementation Gap Matrix (TASK 22)

Status values:
- **I** — implemented and operational
- **I-P** — implemented, partially (gap remains)
- **D** — designed only (docs/contracts)
- **P** — planned (no code)

| Component | Current status | Target status | Required change |
|---|---|---|---|
| Orchestrator | I (stops at `READY_FOR_EXECUTION`; no execution) | I (executes when allowed; deterministic) | Add `EXECUTING`/`COMPLETED`/`HANDED_OFF` states + `execute()` step that drives the Execution Gate and records execution evidence; keep `start()` behavior for compatibility |
| Task Engine | I (create/assign/transition) | I (full lifecycle: schedule/execute/complete/fail/retry) | Add `scheduleTask`, `executeTask`, `completeTask`, `failTask`, `retryTask`, `validateTask`; extend transition table (`FAILED→READY`, `REVIEW→FAILED`); add `failureReason` |
| Policy Engine | I (pure `evaluatePolicy`) | I (unchanged core; keep) | None — already ALLOW/DENY/APPROVAL_REQUIRED before execution; verify gate wiring |
| Approval Engine | I (PENDING→APPROVED/REJECTED/EXPIRED) | I (+ runtime-level NOT_REQUIRED) | Engine unchanged; runtime surfaces `NOT_REQUIRED` when policy allows without approval |
| Handoff Engine | I (record only) | I (full: REQUESTED/ACCEPTED/COMPLETED/FAILED) | Add handoff lifecycle states on the record; wire into runtime + persistence |
| Evidence Store | I (rejects `executionOccurred: true`) | I (accepts real execution evidence) | Allow `executionOccurred: true` when a tool actually ran (keep browser-origin rejection); keep append-only |
| Execution Gate | I (authorization only; always NOT_IMPLEMENTED) | I (authorization + real adapter invocation) | Call `adapter.execute()` when policy ALLOW ∧ approval ok ∧ tool enabled ∧ adapter available ∧ input valid; map result to SUCCEEDED/FAILED; explicit adapter-unavailable state |
| Tool Registry | I (catalog; all disabled) | I (runtime-sufficient definitions) | Add `capabilities`, `inputSchema`, `outputSchema` to `ToolDefinition`; keep `enabled:false` for production catalog |
| Agent Registry | I (in-memory registry) | I (runtime-sufficient definitions) | Add `description`, `inputSchema`, `outputSchema` to `AgentDefinition`; runtime lookup via registry only |
| Agent Runtime | D (no runtime exists) | I | New `AgentRuntime` module: RECEIVED→…→COMPLETED/FAILED/HANDED_OFF driving engines + gate + evidence + handoff |
| Tool adapters | D (interface only, none registered) | I for filesystem/http (real, scoped); explicit unavailable for browser/terminal/mcp | `FilesystemAdapter` (root-scoped, traversal-safe), `HttpAdapter` (read-only, SSRF-guarded); others explicitly unavailable |
| Persistence | D (all engines in-memory) | I-P | Postgres migration `002_agent_runtime.sql` (agent_runs, runtime_tasks, runtime_approvals, runtime_executions, runtime_evidence, runtime_handoffs) + `RunRecorder` port in agent-core + Postgres recorder in apps/web; engines stay in-memory (fast path), recorder snapshots transitions |
| Customer-Zero | I-P (intent → lead → events) | I-P | Add `lead_created` event producer; persist qualification (`lead_qualifications`); keep intent thresholds unchanged; conversation-level idempotency kept |
| Qualification | D-P (validator + table exist; no writer) | I | `qualification-repository.createQualification` writing score/confidence/reason/qualifiedAt/qualifiedBy/supportingEventIds; wired into orchestrator |
| Booking | I-P (mock calendar invents slots in production path) | I-P (safe) | Remove mock from production path; `UnavailableCalendarProvider` with explicit `available:false`; mock only in tests; real provider integration requires credentials (stop condition) |
| Measurement | D (contract only; one event producer) | P (no producers for non-existent flows) | Report NO PRODUCER for events whose business action does not exist; no simulation |

## Environment facts (stop conditions, §36)

- `OPENAI_API_KEY`, `DATABASE_URL`, `OPENAI_ASSISTANT_MODEL`, `ASSISTANT_API_KEY`: **not set** in the review/implementation environment; no `.env.example` exists.
- No real calendar provider available or configured.
- Deployment (Vercel), live validation, live agent runtime execution against production, and the production SEO regression **cannot be performed without credentials/access**; they are reported as stop conditions, not simulated.

## Guardrails applied during implementation

- `packages/agent-core` stays framework-free (no Next.js/React/Postgres/OpenAI/browser deps) — adapters use Node stdlib only; persistence is a port injected from the app.
- No fake adapters, no fake availability, no fake events, no fake success responses.
- Existing security boundaries preserved: assistant API auth gate, rate limiting, ownership enforcement, SEO scanner (`lib/seo/url-policy.ts`), SSRF guards.
