# Tool architecture

**Status:** DESIGNED. Tool runtime: NOT IMPLEMENTED. Browser Use: NOT INSTALLED.

## Purpose

Tools execute actions. Agents do not.

The Tool Registry holds `ToolDefinition` records. The orchestrator requests execution. The policy engine authorizes it. Evidence records the result.

## Generic tool contract

See `agents/contracts/tool-definition.md`.

Required fields: `id`, `name`, `category`, `description`, `capabilities`, `required_permissions`, `risk_level`, `input_schema`, `output_schema`, `enabled`.

## Categories

| Category | Intended use | Status |
|---|---|---|
| `BROWSER` | Web navigation and page interaction via a browser-execution backend | DESIGNED |
| `FILESYSTEM` | Read/write files inside authorized paths | DESIGNED |
| `TERMINAL` | Run authorized commands | DESIGNED |
| `API` | Call authorized external or internal HTTP APIs | DESIGNED |
| `MCP` | Invoke authorized Model Context Protocol tools | DESIGNED |

No adapters for these categories exist in this repository.

## Invocation path

```text
AGENT
→ POLICY CHECK
→ PERMISSION CHECK
→ TOOL EXECUTION
→ RESULT
→ EVIDENCE / AUDIT
```

A tool must not run if:

- `enabled` is false
- the calling agent is not allowed to use it
- the requested capability is not in the tool's `capabilities`
- the policy engine denies the request
- required human approval is missing

## Browser Use integration design

Browser Use is a browser-execution **capability/tool**, not an agent.

### Intended path

```text
Research Agent
      │
      ▼
Task
      │
      ▼
Orchestrator
      │
      ▼
Policy Engine
      │
      ▼
Browser Tool
      │
      ▼
Browser Use
      │
      ▼
Internet
      │
      ▼
Evidence
```

The Browser Use capability must not bypass the policy engine.

The browser must not automatically receive unrestricted permissions.

### Future browser capabilities

These are permission-controlled capabilities. None are implemented.

| Capability | Intended action | Default risk (designed) |
|---|---|---|
| `WEB_SEARCH` | Query a search interface | MEDIUM |
| `WEB_OPEN` | Open a URL | MEDIUM |
| `WEB_READ` | Read page content | MEDIUM |
| `WEB_CLICK` | Click a page element | HIGH |
| `WEB_TYPE` | Enter text into a page | HIGH |
| `WEB_NAVIGATE` | Follow links / change location | MEDIUM |
| `WEB_DOWNLOAD` | Download a file | HIGH |
| `WEB_UPLOAD` | Upload a file | CRITICAL |

Risk may be raised by context (authenticated session, payment page, account settings, form submission).

### Authorization rules for browser capabilities

- Each capability requires an explicit permission.
- Authenticated or mutating actions require `HIGH` or `CRITICAL` handling and human approval.
- Successful browser work must produce `Evidence` with source URL, collected time, and provenance.
- Failed or blocked attempts must also be recorded. Absence of a record is not success.

## Hermes

Hermes is an external/local agent runtime. If it later connects, it must use this tool and policy layer rather than calling Browser Use or other tools directly.

That connection is PLANNED. It is not implemented.

## What this document does not authorize

- Installing Browser Use
- Implementing tool adapters
- Connecting APIs
- Granting unrestricted browser permissions
- Treating any tool as an agent
