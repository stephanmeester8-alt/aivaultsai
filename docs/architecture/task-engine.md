# Task Engine

**Status:** IMPLEMENTED as an in-memory lifecycle manager in `packages/agent-core`. It does not execute tools, call agents, or persist data.

## Responsibilities

The Task Engine answers: **who owns this task, and what is its status?**

It can:

- create, retrieve, list, and update tasks
- assign a registered agent
- transition status through an explicit table
- reject invalid data, unknown agents, and illegal transitions

It does not:

- execute tools
- call LLMs or specialist agents
- evaluate permissions (that is the Policy Engine)
- access a network, database, or filesystem

## Lifecycle

Happy path:

```text
BACKLOG → READY → IN_PROGRESS → REVIEW → DONE
```

Failure and wait paths:

```text
READY → BLOCKED
IN_PROGRESS → BLOCKED
IN_PROGRESS → FAILED
BLOCKED → READY
REVIEW → IN_PROGRESS
REVIEW → DONE
```

Tasks may be created only in `BACKLOG` or `READY`. `IN_PROGRESS` and `REVIEW` require `assignedTo`.

## Transition table

| From | Allowed to |
|---|---|
| `BACKLOG` | `READY` |
| `READY` | `IN_PROGRESS`, `BLOCKED` |
| `IN_PROGRESS` | `REVIEW`, `BLOCKED`, `FAILED` |
| `BLOCKED` | `READY` |
| `REVIEW` | `IN_PROGRESS`, `DONE` |
| `DONE` | none |
| `FAILED` | none |

Any other change is `INVALID_TRANSITION`. Do not scatter extra status logic outside this table (`TASK_TRANSITIONS`).

## Assignment rules

- `assignedTo` must be a registered `AgentId`. Unknown agents are `INVALID_AGENT`.
- Agents are never created by the Task Engine.
- Reassignment is allowed only in `BACKLOG`, `READY`, and `BLOCKED`.
- Reassignment is rejected (`TASK_NOT_ASSIGNABLE`) for `IN_PROGRESS`, `REVIEW`, `DONE`, and `FAILED`.

`createdBy` follows the Task 2 union: a registered-style `AgentId`, or `human`, or `system`.

## Error model

| Code | When |
|---|---|
| `TASK_NOT_FOUND` | Unknown `taskId` |
| `INVALID_TASK` | Empty title/objective, bad priority/risk, or illegal patch fields |
| `INVALID_AGENT` | Unknown or unregistered assignee |
| `INVALID_STATUS` | Unknown status, or create not in BACKLOG/READY |
| `INVALID_TRANSITION` | Status pair not in the table |
| `TASK_NOT_ASSIGNABLE` | Reassign in a locked status, or IN_PROGRESS/REVIEW without assignee |
| `TASK_ALREADY_EXISTS` | Duplicate `taskId` |

Thrown as `TaskEngineError`. Invalid input is rejected, not coerced.

## Event model

Optional in-memory `TaskEvent` records: `TASK_CREATED`, `TASK_ASSIGNED`, `TASK_STATUS_CHANGED`.

They are not persisted. There is no event bus.

## Relationship with the Policy Engine

| Engine | Question |
|---|---|
| Task Engine | Who owns this task, and what is its status? |
| Policy Engine | Is this agent allowed to perform this tool action? |

The Task Engine must not call `evaluatePolicy` and must not treat assignment as authorization to run tools. `ALLOW` from policy still does not execute anything.

## What is implemented

- In-memory `TaskEngine` (`Map`)
- Explicit transition table
- Assignment rules and typed errors
- Returned copies so callers cannot mutate internal state
- Optional in-memory events

## What is not implemented

- Orchestrator
- Agent/LLM runtime
- Tool execution, Browser Use, Hermes
- Persistence, queues, API, UI
- Audit storage
