# Agent permissions and policy

**Status:** Policy engine: IMPLEMENTED as a pure decision function in `packages/agent-core` (`evaluatePolicy` — see `docs/security/policy-engine.md`). Approval runtime: IMPLEMENTED as an in-memory `ApprovalEngine` (see `docs/security/approval-engine.md`). Agent runtime with execution: IMPLEMENTED (see `docs/architecture/runtime.md`). Authentication / user management, secret handling implementation, and a unified audit query layer: NOT IMPLEMENTED.

## Principle

Agents reason. Tools execute. The policy engine authorizes. Humans approve high-risk actions.

An agent cannot grant itself a permission, disable a policy check, or treat a tool as always allowed.

## Invocation path

Every tool invocation must eventually pass through:

```text
AGENT
→ POLICY CHECK
→ PERMISSION CHECK
→ TOOL EXECUTION
→ RESULT
→ EVIDENCE / AUDIT
```

If any check fails, execution must not occur. The denial should be recorded.

## RiskLevel

| Value | Meaning |
|---|---|
| `LOW` | Read-only, local, reversible, no external side effects |
| `MEDIUM` | External read, limited side effects, or reversible writes inside authorized scope |
| `HIGH` | External mutation, messaging, publishing, downloads, form interaction |
| `CRITICAL` | Irreversible, financial, destructive, credentialed, or sensitive-data actions |

Risk is assessed per action, not only per tool. A `BROWSER` tool may be `MEDIUM` for `WEB_READ` and `CRITICAL` for `WEB_UPLOAD`.

## High-risk action classes

These eventually require human approval. No autonomous execution of these classes is authorized.

- publishing content
- sending messages
- purchases
- deleting data
- uploading sensitive files
- changing account settings
- submitting forms
- authenticated external actions

## Permission model (conceptual)

A permission grant is a tuple:

| Field | Meaning |
|---|---|
| `agent_id` | Who is asking |
| `tool_id` | Which tool |
| `capability` | Which capability on that tool |
| `scope` | Optional path, domain, or resource constraint |
| `max_risk` | Highest `RiskLevel` allowed without a new approval |
| `approval_required` | Whether an `Approval` record is mandatory |

Designed default: deny unless an explicit grant exists.

Browser capabilities are individually gated. The browser must not receive unrestricted permissions by default.

## Human-in-the-loop

See `agents/contracts/approval.md`.

| Approval status | Effect |
|---|---|
| `PENDING` | Action must wait |
| `APPROVED` | Action may proceed within the approved scope |
| `REJECTED` | Action must not proceed |
| `EXPIRED` | Treat as not approved |

`HIGH` and `CRITICAL` actions require an `Approval` in status `APPROVED` before execution.

## Secrets

- Do not store secrets in this repository.
- Do not print, log, or commit API keys, tokens, passwords, or credentials.
- Tool definitions must not embed secrets.
- Evidence must not include secret values.

Secret handling implementation is NOT IMPLEMENTED. The rule still applies to all work in this repository.

## Audit

Designed audit record (partially implemented): who requested, which policy decision, which permission, whether approval existed, tool id, capability, timestamp, result, and related `evidence_id` or denial reason. The agent runtime now emits these as append-only `RunRecordEntry` snapshots consumed by the persistence recorder (migration `002_agent_runtime.sql`); a human-friendly audit query UI is NOT IMPLEMENTED.

## Forbidden

- Bypass policy or permission checks
- Use browser capabilities without authorization
- Expose secrets
- Claim a denied or unexecuted action succeeded
- Implement autonomous high-risk execution
