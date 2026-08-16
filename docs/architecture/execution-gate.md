# Execution Gate

**Status:** IMPLEMENTED as a fail-closed authorization boundary. Actual tool execution is **not implemented**. Every authorized attempt returns `NOT_IMPLEMENTED`.

## Execution boundary

Agents never execute tools, adapters, Browser Use, or Hermes.

```text
AGENT → ORCHESTRATOR → POLICY ENGINE → APPROVAL WHEN REQUIRED
→ EXECUTION GATE → TOOL ADAPTER → EXTERNAL SYSTEM
```

The last two steps do not run in this task. The Orchestrator still stops at `READY_FOR_EXECUTION` and does not call the gate automatically.

## Authorization requirement

The gate re-evaluates `evaluatePolicy()`. It does not copy Policy Engine rules.

| Policy | Gate result |
|---|---|
| `DENY` | `REJECTED` |
| `APPROVAL_REQUIRED` | `REJECTED` |
| `ALLOW` | `NOT_IMPLEMENTED` (no adapter invocation) |

A supplied `authorization: null` is treated as missing authorization → `REJECTED`. A forged `ALLOW` that does not match a fresh `evaluatePolicy` result is `REJECTED`. Disabled tools are rejected even if a caller forges `ALLOW`.

## Adapter abstraction

`ToolAdapter` is a future `execute(request)` seam.

`ToolAdapterRegistry` can register/get/has adapters. **No adapters are registered**, including Browser Use and Hermes. The gate never calls `adapter.execute()` in this phase.

## Tool registry relationship

The existing `ToolRegistry` is required. Unknown tools and `enabled === false` → `REJECTED`. Production catalog tools remain disabled.

## Approval relationship

Approvals stay task-scoped, action-scoped, and risk-scoped. Wrong task, wrong action, or insufficient risk → `REJECTED`. Approval is not permanent permission. The gate does not modify `AgentDefinition` or `ToolDefinition`.

## Evidence relationship

`executionOccurred` is always `false`. The gate does not write evidence. Successful execution evidence is forbidden until a real adapter exists.

## Default deny

Unknown agent, task, tool, permission, risk, approval, authorization, or adapter cannot produce `SUCCEEDED`. Unexpected paths fail closed as `REJECTED` or `NOT_IMPLEMENTED`.

## Future Browser Use adapter

A later task may register a Browser Use adapter behind this gate and policy. It is not installed.

## Future Hermes adapter

Hermes may later connect through this gate. It is not integrated.

## Current NOT_IMPLEMENTED behavior

After all checks pass, the gate returns `NOT_IMPLEMENTED` with `executionOccurred: false`. That means authorized, not executed.
