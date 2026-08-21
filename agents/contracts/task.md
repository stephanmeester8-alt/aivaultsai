# Task

**Status:** IMPLEMENTED as an in-memory `TaskEngine` in `packages/agent-core` (see `docs/architecture/task-engine.md`). Full lifecycle: create, schedule, execute, complete, fail, retry, validate.

A `Task` is the unit of work the orchestrator assigns to an agent.

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `task_id` | string | yes | Unique identifier |
| `title` | string | yes | Short label |
| `objective` | string | yes | What done means |
| `created_by` | string | yes | Agent id, system, or human actor |
| `assigned_to` | string \| null | yes | Agent id, or null if unassigned |
| `priority` | integer | yes | Lower number = higher priority. Range: 1–5. Independent of `risk_level`. |
| `status` | `TaskStatus` | yes | Current lifecycle status |
| `inputs` | object | yes | Structured inputs. May be empty. |
| `expected_output` | string | yes | Acceptance criteria |
| `dependencies` | string[] | yes | Other `task_id` values that must complete first |
| `evidence_required` | boolean | yes | If true, `DONE` requires one or more `Evidence` records |
| `risk_level` | `RiskLevel` | yes | Highest expected risk of completing this task |
| `created_at` | string | yes | Creation timestamp (ISO-8601 UTC) |
| `updated_at` | string | yes | Last transition timestamp (ISO-8601 UTC) |
| `failure_reason` | string \| null | no | Set when the task fails; cleared on retry |

## TaskStatus

| Status | Meaning |
|---|---|
| `BACKLOG` | Recorded, not ready |
| `READY` | Classified and assignable |
| `IN_PROGRESS` | Assigned work is underway |
| `BLOCKED` | Waiting on dependency, permission, evidence, or approval |
| `REVIEW` | Submitted for verification or human review |
| `DONE` | Objective met; required evidence present |
| `FAILED` | Could not complete; failure recorded |

## RiskLevel

`LOW` | `MEDIUM` | `HIGH` | `CRITICAL`

## Invariants

1. `assigned_to` must be a registered agent id when `status` is `IN_PROGRESS`.
2. `DONE` is invalid if `evidence_required` is true and no evidence is linked.
3. `HIGH` or `CRITICAL` tasks cannot skip the approval stage when they request matching actions.
4. Status changes are orchestrator-owned.
5. A task is not complete because an agent said it is complete. Completion requires the orchestrator transition to `DONE`.

## Relationship to other contracts

- Assigned agent must match an `AgentDefinition.id`.
- Transfers between agents use `Handoff`.
- Claims and executions use `Evidence`.
- High-risk actions use `Approval`.
