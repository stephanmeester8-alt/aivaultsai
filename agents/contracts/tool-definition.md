# ToolDefinition

**Status:** DESIGNED. Tool registry and adapters: NOT IMPLEMENTED.

A tool executes an action. It is not an agent.

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Stable identifier, unique in the registry |
| `name` | string | yes | Human-readable name |
| `category` | `ToolCategory` | yes | Execution class |
| `description` | string | yes | What the tool does |
| `capabilities` | string[] | yes | Permission-gated operations this tool can perform |
| `required_permissions` | string[] | yes | Permission keys required before invocation |
| `risk_level` | `RiskLevel` | yes | Baseline risk. Individual capabilities may be higher. |
| `input_schema` | object | yes | Invocation input shape |
| `output_schema` | object | yes | Result shape |
| `enabled` | boolean | yes | If false, the tool must not run |

## ToolCategory

`BROWSER` | `FILESYSTEM` | `TERMINAL` | `API` | `MCP`

## RiskLevel

`LOW` | `MEDIUM` | `HIGH` | `CRITICAL`

## Invariants

1. `enabled: false` means no execution, even if an agent lists the tool as allowed.
2. Requested capability must be in `capabilities`.
3. Category `BROWSER` does not imply Browser Use is installed.
4. Tools do not authorize themselves. Policy does.
5. Output must be auditable. Secrets must be redacted.

## Conceptual input_schema

```text
{
  task_id: string
  agent_id: string
  capability: string
  arguments: object
  approval_id: string | null
}
```

## Conceptual output_schema

```text
{
  ok: boolean
  capability: string
  result: object | null
  error: string | null
  evidence_id: string | null
}
```

## Browser capabilities (designed, not implemented)

`WEB_SEARCH` | `WEB_OPEN` | `WEB_READ` | `WEB_CLICK` | `WEB_TYPE` | `WEB_NAVIGATE` | `WEB_DOWNLOAD` | `WEB_UPLOAD`

These belong on a future Browser tool definition. They are not enabled.

See `docs/architecture/tool-architecture.md`.

## No tools are registered yet

This repository contains the contract only. There is no live tool catalog.
