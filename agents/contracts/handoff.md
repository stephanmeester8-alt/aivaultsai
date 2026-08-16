# Handoff

**Status:** DESIGNED. Handoff system: NOT IMPLEMENTED.

A `Handoff` is a structured engineering artifact. It is not a chat message.

It transfers work from one agent to another against a specific task.

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `handoff_id` | string | yes | Unique identifier |
| `from_agent` | string | yes | Sending `AgentDefinition.id` |
| `to_agent` | string | yes | Receiving `AgentDefinition.id` |
| `task_id` | string | yes | Related `Task.task_id` |
| `objective` | string | yes | What the receiver should accomplish next |
| `completed_work` | object \| string | yes | Work already finished, including artifact references |
| `findings` | object[] | yes | Results, including negative results |
| `decisions` | object[] | yes | Decisions made and why |
| `evidence` | string[] | yes | Related `evidence_id` values. Empty only if no claims were made. |
| `risks` | object[] | yes | Known risks for the next step |
| `open_questions` | string[] | yes | Unresolved questions |
| `recommended_next_action` | string | yes | Concrete next action for the receiver or orchestrator |

## Invariants

1. `from_agent` ≠ `to_agent`.
2. `to_agent` must be in the sender's `handoff_targets`.
3. `task_id` must exist.
4. Informal chat, comments, or summaries are not substitutes for this object.
5. `evidence` must not contain invented ids.
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
