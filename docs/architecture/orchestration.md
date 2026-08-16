# Orchestration lifecycle

**Status:** DESIGNED. Runtime: NOT IMPLEMENTED.

## Purpose

The orchestrator is the only component that coordinates agents, tasks, tools, and approvals. Agents reason and request work. They do not own the lifecycle.

## Designed lifecycle

```text
TASK CREATED
↓
CLASSIFY
↓
ASSIGN AGENT
↓
PLAN
↓
POLICY CHECK
↓
EXECUTE TOOLS
↓
COLLECT RESULTS
↓
VERIFY
↓
CREATE EVIDENCE
↓
HANDOFF
↓
HUMAN APPROVAL WHEN REQUIRED
↓
COMPLETE
```

## Stage definitions

| Stage | Owner | Description |
|---|---|---|
| TASK CREATED | Task Engine | A `Task` record is created with objective, inputs, risk, and expected output. Initial status is typically `BACKLOG` or `READY`. |
| CLASSIFY | Orchestrator | Determine domain, required agent role, required tools, and risk level. Classification is not execution. |
| ASSIGN AGENT | Orchestrator | Bind `assigned_to` to one registered agent `id`. Agents do not self-assign system-wide work. |
| PLAN | Assigned agent | Produce a plan: steps, required tools, evidence needs, handoff targets, and approval points. |
| POLICY CHECK | Policy Engine | Evaluate whether the planned tools, capabilities, and risk are allowed for that agent and task. |
| EXECUTE TOOLS | Tool Registry / tool adapters | Tools execute authorized actions. Agents do not execute tools directly. |
| COLLECT RESULTS | Orchestrator | Gather tool outputs and agent artifacts. Unexecuted work is not a result. |
| VERIFY | Assigned agent + orchestrator | Check completeness against `expected_output` and `evidence_required`. |
| CREATE EVIDENCE | Evidence System | Persist `Evidence` records for claims and executions. |
| HANDOFF | Handoff System | If another agent must continue, create a structured `Handoff`. |
| HUMAN APPROVAL WHEN REQUIRED | Approval flow | Required for `HIGH` and `CRITICAL` actions. No autonomous bypass. |
| COMPLETE | Task Engine | Transition to `DONE` or `FAILED`. Failed tasks must record why. |

## Task status mapping

| Status | Meaning |
|---|---|
| `BACKLOG` | Recorded, not ready to start |
| `READY` | Classified and assignable |
| `IN_PROGRESS` | Assigned agent is planning or working |
| `BLOCKED` | Waiting on dependency, evidence, permission, or approval |
| `REVIEW` | Work submitted; verification or human review pending |
| `DONE` | Objective met with required evidence |
| `FAILED` | Could not complete; failure recorded |

A task may return to `BLOCKED` or `IN_PROGRESS` from `REVIEW` if verification fails.

## Policy placement

Policy check occurs **before** tool execution, not after.

Unauthorized tool use is a failed policy check, not an execution result.

Browser capabilities follow the same path. Browser Use must not bypass the policy engine.

## Approval placement

Human approval is required when:

- planned action risk is `HIGH` or `CRITICAL`
- the action matches a high-risk class (publish, message, purchase, delete, sensitive upload, account change, form submit, authenticated external action)

Until an `Approval` is `APPROVED`, the corresponding action must not execute.

## Handoff placement

Handoff is a lifecycle stage, not a side-channel chat.

The receiving agent starts from the `Handoff` artifact plus the related `Task` and `Evidence`, not from informal conversation.

## What is not implemented

- Task queue or scheduler
- Agent runtime
- Automatic classification
- Tool execution
- Approval UI or workflow engine
- Persistence

This file is documentation only.
