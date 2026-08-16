# Approval

**Status:** DESIGNED. Approval workflow: NOT IMPLEMENTED.

An `Approval` is the human-in-the-loop gate for high-risk actions.

No autonomous execution of `HIGH` or `CRITICAL` actions is authorized by this contract.

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `approval_id` | string | yes | Unique identifier |
| `task_id` | string | yes | Related task |
| `requested_action` | string \| object | yes | Action to authorize, including tool, capability, and scope |
| `risk_level` | `RiskLevel` | yes | Assessed risk of the requested action |
| `requested_by` | string | yes | Agent id or system actor requesting approval |
| `approved_by` | string \| null | yes | Human actor who resolved it, or null while pending |
| `status` | `ApprovalStatus` | yes | Current state |
| `created_at` | datetime | yes | Request timestamp (UTC) |
| `resolved_at` | datetime \| null | yes | Resolution timestamp (UTC), or null if pending |

## ApprovalStatus

| Status | Meaning |
|---|---|
| `PENDING` | Waiting for a human. Action must not run. |
| `APPROVED` | Human authorized the requested action within scope. |
| `REJECTED` | Human denied the action. |
| `EXPIRED` | Window elapsed. Treat as not approved. |

## RiskLevel

`LOW` | `MEDIUM` | `HIGH` | `CRITICAL`

## When approval is required

Required for `HIGH` and `CRITICAL` actions, including:

- publishing content
- sending messages
- purchases
- deleting data
- uploading sensitive files
- changing account settings
- submitting forms
- authenticated external actions

## Invariants

1. `approved_by` must be a human actor when `status` is `APPROVED` or `REJECTED`.
2. An agent cannot approve its own request.
3. Approval is scoped to `requested_action`. It is not a blanket grant.
4. `EXPIRED` and `REJECTED` are denials.
5. Missing approval is a denial.

## Relationship to execution

```text
requested action
→ create Approval (PENDING)
→ human decision
→ if APPROVED: policy check → permission check → tool execution
→ else: do not execute
```
