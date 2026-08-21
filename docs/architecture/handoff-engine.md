# Handoff Engine

**Status:** IMPLEMENTED as an in-memory transfer manager in `packages/agent-core`. It does not execute work, change task status, or grant permissions.

## Purpose

A `Handoff` is a structured engineering artifact, not a chat message.

It records a transfer of work:

```text
FROM AGENT → TO AGENT → TASK
→ completed work, findings, decisions, evidence, risks, open questions
→ recommended next action
```

The Handoff Engine answers: **is this transfer valid, and who is the intended recipient?**

## Lifecycle

1. A `Task` already exists in the Task Engine.
2. A source agent creates a `Handoff` to a target agent.
3. The engine validates agents, targets, task, and required fields.
4. The record is stored in memory. Optional `HANDOFF_CREATED` event is recorded.
5. Task status is unchanged. Policy is not consulted. Tools are not executed.

A task may accumulate multiple handoffs. One task ≠ one handoff.

## Validation

A handoff is accepted only when all of the following hold:

- `handoffId` is a non-empty string and is unique
- `taskId` refers to an existing task (tasks are not auto-created)
- `fromAgent` and `toAgent` are registered
- `fromAgent !== toAgent`
- `toAgent` is in `fromAgent.handoffTargets`
- `objective`, `completedWork`, and `recommendedNextAction` are non-empty
- `findings` is a non-empty string array
- `evidenceIds`, `decisions`, `risks`, and `openQuestions` are string arrays

Invalid input is rejected. It is not coerced.

## Handoff targets

Targets come from `AgentDefinition.handoffTargets` in the Agent Registry. There is no second target table.

Current published targets (do not treat this list as a second source of truth; the registry is):

| From | To |
|---|---|
| `research_intelligence` | CTO, Product, Engineer, Growth |
| `product_ux` | CTO, Research, Engineer, Growth |
| `cto_architect` | Research, Product, Engineer, Growth |
| `principal_engineer` | CTO, Research, Product, Growth |
| `growth_analytics` | CTO, Research, Product, Engineer |

Self-handoff is always rejected (`SELF_HANDOFF`).

## Relationship with the Task Engine

| Engine | Responsibility |
|---|---|
| Task Engine | Task existence, assignment, status |
| Handoff Engine | Structured transfer records |

The Handoff Engine may read `hasTask`. It must not call `transitionTask` or `assignTask`. Creating a handoff does not move `IN_PROGRESS` to `REVIEW`.

## Relationship with the Policy Engine

A successful handoff means: **agent B is the intended recipient of this work.**

It does not mean: **agent B may execute tools.**

Authorization remains `evaluatePolicy`. The Handoff Engine must not grant or bypass permissions.

## Evidence references

`evidenceIds` is a list of string IDs. Shape is checked. Existence is not: the Handoff Engine never fabricates evidence references; the Evidence Store is the source of truth for records.

## Immutability

Internal records are stored as copies. `getHandoff` / `listHandoffs` return copies. Mutating a returned object does not change engine state.

## What is implemented

- In-memory `HandoffEngine`
- Validation against registry + Task Engine
- Typed errors
- Optional in-memory `HANDOFF_CREATED` events

## What is not implemented

- Orchestrator-driven handoff flow
- Automatic task status or assignment changes
- Evidence store
- Persistence, queues, event bus
- Tool execution, Browser Use, Hermes, LLM calls
