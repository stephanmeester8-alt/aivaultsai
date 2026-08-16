# Approval Engine

**Status:** IMPLEMENTED as an in-memory human-approval record manager in `packages/agent-core`. It does not execute tools and does not authorize them.

## Purpose

The Approval Engine stores human decisions for a specific requested action on a specific task.

`APPROVED` means: a human authorized **this** action for **this** task, at **this** risk level.

It does not mean permanent permission, unrestricted tools, or a Policy Engine bypass.

## Human-in-the-loop model

```text
AGENT → REQUEST ACTION → POLICY → APPROVAL_REQUIRED
→ HUMAN → APPROVED / REJECTED
→ POLICY RE-EVALUATION → ALLOW / DENY
```

The Approval Engine never auto-approves. It never calls `evaluatePolicy`. The Policy Engine remains the final authorization decision.

`approvedBy` is a human identity string in this phase. It is not an `AgentId`, not authenticated, and there is no user database.

## Lifecycle

New records must be `PENDING`. Human decisions happen only through `approve`, `reject`, or `expire`.

```text
PENDING → APPROVED | REJECTED | EXPIRED
```

`APPROVED`, `REJECTED`, and `EXPIRED` are terminal. They cannot be changed or reset.

Expiration is explicit (`expire`). There is no background job.

## Self-approval prevention

`requestedBy` is a registered agent. The approver must be a distinct human identity.

- `approver === requestedBy` → `SELF_APPROVAL`
- approver that is an `AgentId` → `INVALID_APPROVER`

An agent cannot approve its own request.

## Task binding

Every approval references an existing Task Engine task. Unknown tasks are rejected. Tasks are not auto-created.

## Action binding

`requestedAction` is stored and never rewritten. An approval for "browser research" is not an approval for a destructive action. The Policy Engine must compare the request to this field later; this engine only preserves the binding.

## Risk binding

The stored `riskLevel` is the approved ceiling. A `HIGH` approval does not cover `CRITICAL`. `isApprovalRiskSufficient` / `evaluatePolicy` enforce that. The Approval Engine does not silently escalate risk.

## Expiration

`expire(approvalId)` is allowed only from `PENDING`. Terminal states return `APPROVAL_ALREADY_RESOLVED`.

## Relationship with the Policy Engine

| Component | Role |
|---|---|
| Approval Engine | Record human PENDING/APPROVED/REJECTED/EXPIRED state |
| Policy Engine | Decide ALLOW / DENY / APPROVAL_REQUIRED |

Supply the approval record to `evaluatePolicy`. Do not treat `approve()` as tool authorization.

## What is implemented

- In-memory `ApprovalEngine`
- Lifecycle and typed errors
- Task and agent existence checks
- Self-approval rejection
- In-memory events (`APPROVAL_CREATED`, `APPROVAL_APPROVED`, `APPROVAL_REJECTED`, `APPROVAL_EXPIRED`)

## What is not implemented

- Authentication / user management
- Background expiry
- Tool execution, Browser Use, Hermes, LLM
- Persistence, API, UI
- Automatic policy re-evaluation
