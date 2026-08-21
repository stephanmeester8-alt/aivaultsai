# Handoff

**Status:** IMPLEMENTED as an in-memory `HandoffEngine` in `packages/agent-core` (see `docs/architecture/handoff-engine.md`).

A `Handoff` is a structured engineering artifact. It is not a chat message.

It transfers work from one agent to another against a specific task.

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `handoffId` | string | yes | Unique identifier |
| `fromAgent` | string | yes | Sending `AgentDefinition.id` |
| `toAgent` | string | yes | Receiving `AgentDefinition.id` |
| `taskId` | string | yes | Related `Task.taskId` |
| `objective` | string | yes | What the receiver should accomplish next |
| `completedWork` | string | yes | Work already finished, including artifact references |
| `findings` | string[] | yes | Results, including negative results (non-empty) |
| `decisions` | string[] | yes | Decisions made and why |
| `evidenceIds` | string[] | yes | Related `evidenceId` values. Empty only if no claims were made. |
| `risks` | string[] | yes | Known risks for the next step |
| `openQuestions` | string[] | yes | Unresolved questions |
| `recommendedNextAction` | string | yes | Concrete next action for the receiver or orchestrator |
| `createdAt` | string | yes | Creation timestamp (ISO-8601 UTC) |

## Invariants

1. `fromAgent` ≠ `toAgent`.
2. `toAgent` must be in the sender's `handoffTargets`.
3. `taskId` must exist.
4. Informal chat, comments, or summaries are not substitutes for this object.
5. `evidenceIds` must not contain invented ids.
6. The receiver does not inherit the sender's tool permissions.

## Required quality

Each handoff should be usable without the original conversation:

- what was done
- what was learned
- what was decided
- what remains unknown
- what should happen next
- what could go wrong

## Orchestrator role

The orchestrator accepts the handoff, reassigns `Task.assigned_to`, and continues the lifecycle. Agents do not reassign tasks themselves.
