# Agent Runtime

**Status:** IMPLEMENTED in `packages/agent-core` (`src/runtime`). Deterministic, in-memory; drives the existing engines. No model invocation.

## Purpose

The runtime is the concrete lifecycle driver that makes the architecture end-to-end executable:

```text
AGENT REQUEST
  → Agent Registry (agent exists, ACTIVE)
  → Orchestrator (task creation + assignment + policy)
  → Task Engine (task lifecycle)
  → Policy Engine (ALLOW / DENY / APPROVAL_REQUIRED)
  → Approval Engine (human decision when required)
  → Execution Gate (re-check + adapter boundary)
  → Tool Adapter (filesystem / http; others explicitly unavailable)
  → Execution
  → Evidence Store (execution evidence from the gate result)
  → Handoff (structured transfer)
  → Final Result
```

## Lifecycle

```text
RECEIVED
  → PLANNED
  → POLICY_CHECKED
  → APPROVAL_REQUIRED → APPROVED → READY_FOR_EXECUTION
  → EXECUTING
  → COMPLETED | FAILED | HANDED_OFF
```

Every transition is explicit, recorded (in-memory run record) and reported to the optional `RunRecorder` (see Persistence). The runtime never invents a state: `COMPLETED` requires a `SUCCEEDED` gate result with stored execution evidence; `FAILED` carries a concrete reason.

## Components

| Symbol | Responsibility |
|---|---|
| `AgentRuntime` / `createAgentRuntime` | Lifecycle driver over the engines |
| `AGENT_RUN_STATES`, `AgentRun`, `AgentRunRequest` | Typed lifecycle contract |
| `RuntimeError` | Typed errors (`RUN_ALREADY_EXISTS`, `RUN_NOT_FOUND`, `INVALID_RUN_REQUEST`, `AGENT_NOT_FOUND`, `INVALID_STATE_TRANSITION`) |

## Determinism and boundaries

- The runtime delegates to the Orchestrator, Task Engine, Policy Engine, Approval Engine, Execution Gate, Evidence Store and Handoff Engine. No hidden business logic.
- Execution evidence (`executionOccurred: true`) is created only from a `SUCCEEDED` Execution Gate result; manual fabrication is rejected.
- Duplicate run ids are rejected (idempotency).

## Persistence

The runtime accepts an optional `RunRecorder` port (`src/persistence/types.ts`): an append-only audit sink receiving typed entries for runs, tasks, approvals, executions (SHA-256 input/output hashes only — no raw values), evidence and handoffs. The app layer provides `PostgresRunRecorder` (`apps/web/lib/runtime/postgres-run-recorder.ts`) writing to migration `002_agent_runtime.sql`. Recorder failures are non-fatal.

## What is not implemented

- Autonomous LLM reasoning/model invocation.
- Persistent engine state (engines remain in-memory; persistence is an audit snapshot via the recorder).
- Browser, terminal and MCP adapters (explicitly unavailable).
