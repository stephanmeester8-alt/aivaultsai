# Orchestrator

**Status:** IMPLEMENTED as a deterministic in-memory coordinator in `packages/agent-core`. `start()` stops at `READY_FOR_EXECUTION`; `execute()` runs the authorized request through the Execution Gate and records execution evidence exclusively from the gate result. It never calls models directly.

## Responsibility

The Orchestrator coordinates existing engines. It does not own their internal state.

| Component | Owns |
|---|---|
| Orchestrator | Coordination and orchestration state |
| TaskEngine | Task lifecycle |
| AgentRegistry | Agent identity |
| `evaluatePolicy` | Authorization |
| ApprovalEngine | Human approval records |
| HandoffEngine | Structured transfers |
| EvidenceStore | Evidence records |
| ToolRegistry | Tool definitions (not execution) |

## Dependency injection

`createOrchestrator({ agents, tasks, handoffs, evidence, approvals, tools })`

No hidden singletons. `evaluatePolicy` remains a pure function imported by the orchestrator, not a stored mutable engine.

## Orchestration lifecycle

```text
REQUEST → CREATE TASK → ASSIGN AGENT → EVALUATE POLICY
→ ALLOW | DENY | APPROVAL_REQUIRED
→ if approval required: CREATE APPROVAL (PENDING) → WAIT
→ human approve/reject → RE-EVALUATE POLICY
→ AUTHORIZED → READY_FOR_EXECUTION → STOP
```

`start()` stops at `READY_FOR_EXECUTION`. An explicit `execute()` then passes the request to the Execution Gate; a successful adapter result can transition orchestration to `COMPLETED`. Authorization alone never claims execution.

## Policy integration

Policy results map to orchestration state:

| Policy | Orchestration |
|---|---|
| `ALLOW` | `AUTHORIZED` then `READY_FOR_EXECUTION` |
| `APPROVAL_REQUIRED` | `WAITING_FOR_APPROVAL` (ApprovalEngine creates PENDING) |
| `DENY` | `FAILED` with `POLICY_DENIED: …` |

Approvals are never auto-approved. `ALLOW` is authorization only.

## Approval integration

`approve(requestId, approvalId, approver)` calls ApprovalEngine, then re-runs policy. Approval ≠ authorization. Unrelated approval IDs are `APPROVAL_INVALID`.

## Task integration

Tasks are created and assigned only through TaskEngine. Authorized work stays `READY` on the task. The orchestrator never transitions a task to `DONE`.

## Handoff integration

`handoff()` registers a HandoffEngine record. It does not mean execution occurred and does not mark the task `DONE`.

## Evidence integration

`attachEvidence()` stores a record via EvidenceStore. Execution evidence (`executionOccurred: true`) is rejected (`EXECUTION_NOT_IMPLEMENTED`). Start() does not invent evidence.

## State machine

```text
CREATED → ASSIGNED → POLICY_CHECK
POLICY_CHECK → WAITING_FOR_APPROVAL | AUTHORIZED | FAILED
WAITING_FOR_APPROVAL → POLICY_CHECK
AUTHORIZED → READY_FOR_EXECUTION
READY_FOR_EXECUTION → EXECUTING          (explicit execute())
EXECUTING → COMPLETED | FAILED | HANDED_OFF
COMPLETED → HANDED_OFF                    (handoff() after completion)
READY_FOR_EXECUTION | FAILED | BLOCKED → (terminal unless execute()/retry)
```

## Execution boundary

There is no `runBrowser`, `runHermes`, `runAgent`, or `callLLM`. Execution happens only through `execute()`, which re-checks everything via the Execution Gate and calls the registered tool adapter. `READY_FOR_EXECUTION` means: policy allowed the requested action (and approval was valid if required). It does **not** mean a tool ran — only a `SUCCEEDED` gate result means execution occurred.

## What is implemented

- Deterministic `Orchestrator`
- Explicit state table
- Wiring of Task, Policy, Approval, Handoff, Evidence
- Stop at `READY_FOR_EXECUTION` during `start()`
- Explicit `execute()` integration with the Execution Gate

## What is not implemented

- Browser Use, Hermes, LLM, MCP
- Persistence, network, auth, UI, queues
- Task `DONE` / execution runtime
