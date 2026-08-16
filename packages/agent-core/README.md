# @aivaultsai/agent-core

Typed domain contracts for the AIVaultsAI agent system.

**Status:** IMPLEMENTED as TypeScript types, in-memory domain engines, a pure Policy Decision Engine, a deterministic Orchestrator that stops at READY_FOR_EXECUTION, and an Execution Gate that returns NOT_IMPLEMENTED. No agent runtime, tool execution, or Browser Use adapter is implemented.

## Purpose

This package turns the Task 1 conceptual contracts into a small, framework-independent TypeScript foundation.

It exists so later tasks can share one set of IDs, statuses, and permission names without merging Agent, Task, Tool, Policy, Evidence, Handoff, Approval, or Orchestrator into a single type.

## Architecture

| Concept | Meaning in this package |
|---|---|
| Agent | Reasoning/decision-making role (`AgentDefinition`) |
| Task | Unit of work (`TaskEngine` manages lifecycle only) |
| Tool | Capability used to perform an action (`ToolDefinition` only) |
| Policy | Authorization decision (`evaluatePolicy`). Does not execute. |
| Evidence | Proof/provenance of information (`EvidenceStore`). Not truth. |
| Handoff | Structured transfer of work (`HandoffEngine`) |
| Approval | Human authorization records (`ApprovalEngine`). Policy still decides. |
| Orchestrator | Coordinates engines. Stops at READY_FOR_EXECUTION. Does not execute. |
| Execution Gate | Sole future execution boundary. Always returns NOT_IMPLEMENTED in this phase. |

Agent definitions do not import or name Browser Use. Browser execution, if added later, must be a replaceable tool adapter behind policy.

## Agent registry

`AgentRegistry` is in-memory only. There is no database.

Responsibilities:

- register agents
- retrieve an agent by ID
- list agents
- verify an agent exists
- reject duplicate IDs
- reject unknown IDs

`createInitialAgentRegistry()` registers exactly the five specialist agents. `getAgent(id)` reads that initial set.

Typed IDs (snake_case):

| AgentId | Name |
|---|---|
| `cto_architect` | CTO / AI Systems Architect |
| `research_intelligence` | Research Intelligence |
| `product_ux` | Product / UX |
| `principal_engineer` | Principal AI Full-Stack Engineer |
| `growth_analytics` | Growth / Analytics |

These map to the Task 1 markdown ids (`cto-architect`, and so on). The executable contract uses `AgentId` above.

## Contracts

Public exports from `src/index.ts`:

- `AgentId`, `AgentDefinition`, `AgentRegistry`
- `Task`, `TaskStatus`, `TaskPriority`, `TaskEngine`
- `Handoff`, `HandoffEngine`
- `Evidence`, `EvidenceType`, `Confidence`, `EvidenceStore`
- `ToolDefinition`, `ToolCategory`
- `Permission`, `PolicyDecision`, `PolicyRequest`, `PolicyResult`
- `Approval`, `ApprovalEngine`
- `RiskLevel`

Validation helpers (no Zod): `getAgent`, `isValidAgentId`, `isValidRiskLevel`, `isValidTaskStatus`.

## Permissions

Permissions are declarative boundaries on `AgentDefinition`:

- `allowedPermissions`
- `prohibitedPermissions`

`checkAgentPermission` answers whether a definition *declares* a permission.

`evaluatePolicy` is the authorization decision. It returns `ALLOW`, `DENY`, or `APPROVAL_REQUIRED`. It does not execute tools. See `docs/security/policy-engine.md`.

Least-privilege examples:

| Agent | Declared allowed | Explicitly not automatic |
|---|---|---|
| Research Intelligence | `WEB_SEARCH`, `WEB_READ`, `WEB_NAVIGATE` | `WEB_TYPE`, `WEB_UPLOAD`, `TERMINAL_EXECUTE` |
| Growth / Analytics | `WEB_SEARCH`, `WEB_READ` | `WEB_NAVIGATE` and mutating web actions |
| Principal Engineer | `FILESYSTEM_READ`, `FILESYSTEM_WRITE`, `TERMINAL_EXECUTE` | all `WEB_*` permissions |

`HIGH` and `CRITICAL` actions require a valid human `Approval` before `evaluatePolicy` can return `ALLOW`.

## Browser abstraction

Conceptual tool ids: `browser`, `filesystem`, `terminal`, `http`, `mcp`.

The `browser` `ToolDefinition` has `enabled: false`. Browser Use is not installed.

Intended future path (not implemented):

```text
Research Agent
    ↓
Task
    ↓
Policy Engine
    ↓
Browser Tool
    ↓
Browser Use Adapter
    ↓
Browser
    ↓
Internet
    ↓
Evidence
```

`BrowserToolAdapter` is a replaceable seam. Do not couple `AgentDefinition` to a specific browser product.

## What is implemented

- TypeScript domain types and enums/unions
- Five typed agent definitions
- In-memory agent registry and tool registry
- In-memory task engine (lifecycle only)
- In-memory handoff engine (transfer records only)
- In-memory evidence store (append-only records)
- In-memory approval engine (human decisions only)
- Deterministic orchestrator (coordination only)
- Execution gate (authorization boundary; NOT_IMPLEMENTED)
- Conceptual tool definitions (all default `enabled: false`)
- Declarative permission lookup
- Pure policy decision engine
- Lightweight validators
- Node.js built-in unit tests

## What is NOT implemented

- Agent runtime or model invocation
- Tool execution / Browser Use / Hermes
- Network access
- Database, API, UI
- MCP, Hermes, Ollama

## Tests

Zero package dependencies. Tests use Node.js `node:test` (Node 22+).

```text
npm test
```

or:

```text
node --test ./test/agent-core.test.ts ./test/policy-engine.test.ts ./test/task-engine.test.ts ./test/handoff-engine.test.ts ./test/evidence-store.test.ts ./test/approval-engine.test.ts ./test/orchestrator.test.ts ./test/execution-gate.test.ts
```

## Type checking

This package has no `typescript` dependency (network install was not used).

If `tsc` is available locally:

```text
npx tsc --noEmit -p tsconfig.json
```

Required test/type setup if a later task adds tooling: `typescript` as a devDependency only. Do not add Zod, a test framework, or Browser Use unless a later task authorizes it.
