# Execution Gate

**Status:** IMPLEMENTED as a fail-closed authorization AND execution boundary. A request executes ONLY when policy ALLOW ∧ approval satisfied ∧ tool enabled ∧ adapter registered ∧ input valid. With no adapter the gate returns `NOT_IMPLEMENTED` (explicit unavailable); with an adapter it returns the real `SUCCEEDED`/`FAILED` result (`executionOccurred: true`). Browser/terminal/mcp have no adapters.

## Execution boundary

Agents never execute tools, adapters, Browser Use, or Hermes.

```text
AGENT → ORCHESTRATOR → POLICY ENGINE → APPROVAL WHEN REQUIRED
→ EXECUTION GATE → TOOL ADAPTER → EXTERNAL SYSTEM
```

The Orchestrator does not call the gate automatically. It reaches `READY_FOR_EXECUTION` during `start()`; an explicit `execute()` invokes the gate. Only an enabled tool with a registered adapter can reach an external system.

## Authorization requirement

The gate re-evaluates `evaluatePolicy()`. It does not copy Policy Engine rules.

| Policy | Gate result |
|---|---|
| `DENY` | `REJECTED` |
| `APPROVAL_REQUIRED` | `REJECTED` |
| `ALLOW` | `NOT_IMPLEMENTED` without an adapter; otherwise the adapter's `SUCCEEDED` or `FAILED` result |

A supplied `authorization: null` is treated as missing authorization → `REJECTED`. A forged `ALLOW` that does not match a fresh `evaluatePolicy` result is `REJECTED`. Disabled tools are rejected even if a caller forges `ALLOW`.

## Adapter abstraction

`ToolAdapter` exposes the `execute(request)` seam.

`ToolAdapterRegistry` can register/get/has adapters. The default catalog has no enabled adapters; application integration may explicitly enable and register a constrained adapter. Browser Use and Hermes have no adapters. The gate calls `adapter.execute()` only after all checks succeed.

## Tool registry relationship

The existing `ToolRegistry` is required. Unknown tools and `enabled === false` → `REJECTED`. Production catalog tools remain disabled.

## Approval relationship

Approvals stay task-scoped, action-scoped, and risk-scoped. Wrong task, wrong action, or insufficient risk → `REJECTED`. Approval is not permanent permission. The gate does not modify `AgentDefinition` or `ToolDefinition`.

## Evidence relationship

`executionOccurred` is `false` unless an adapter actually runs. The gate does not write evidence; the orchestrator records execution evidence only from a real gate result.

## Default deny

Unknown agent, task, tool, permission, risk, approval, authorization, or adapter cannot produce `SUCCEEDED`. Unexpected paths fail closed as `REJECTED` or `NOT_IMPLEMENTED`.

## Future Browser Use adapter

A later task may register a Browser Use adapter behind this gate and policy. It is not installed.

## Future Hermes adapter

Hermes may later connect through this gate. It is not integrated.

## Current NOT_IMPLEMENTED behavior

After all checks pass but no adapter is registered, the gate returns `NOT_IMPLEMENTED` with `executionOccurred: false`. That means authorized, not executed.
