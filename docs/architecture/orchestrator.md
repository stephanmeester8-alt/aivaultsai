# Orchestrator

**Status:** IMPLEMENTED as a deterministic in-memory coordinator in `packages/agent-core`. It does not execute tools, call models, or finish work.

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

The orchestrator **stops** at `READY_FOR_EXECUTION`. It does not claim `DONE`, `SUCCESS`, `EXECUTED`, or `COMPLETED`.

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
READY_FOR_EXECUTION | FAILED | BLOCKED → (terminal)
```

## Execution boundary

There is no `executeTool`, `runBrowser`, `runHermes`, `runAgent`, or `callLLM`.

`READY_FOR_EXECUTION` means: policy allowed the requested action (and approval was valid if required). It does **not** mean a tool ran.

## What is implemented

- Deterministic `Orchestrator`
- Explicit state table
- Wiring of Task, Policy, Approval, Handoff, Evidence
- Stop at `READY_FOR_EXECUTION`

## What is not implemented

- Tool execution, Browser Use, Hermes, LLM, MCP
- Persistence, network, auth, UI, queues
- Task `DONE` / execution runtime
