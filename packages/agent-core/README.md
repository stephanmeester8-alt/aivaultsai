# @aivaultsai/agent-core

Typed domain contracts for the AIVaultsAI agent system.

**Status:** IMPLEMENTED as TypeScript contracts, in-memory domain engines, a Policy Decision Engine, deterministic Orchestrator, Execution Gate, and `AgentRuntime` lifecycle driver. Tool execution is possible only through an explicitly enabled, registered adapter after policy and approval checks. The web application currently registers a bounded HTTP adapter for one server-side runtime task; Browser Use and Hermes adapters are not implemented.

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
| Orchestrator | Coordinates engines and invokes the Execution Gate only through explicit `execute()`. |
| Execution Gate | Sole execution boundary; fails closed and returns `NOT_IMPLEMENTED` without an adapter. |
| AgentRuntime | Drives submit, approval, execution, evidence, and handoff lifecycle state. |

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
- Deterministic orchestrator with explicit execution path
- Fail-closed execution gate and adapter registry
- Agent runtime lifecycle driver and optional append-only run recorder
- Conceptual tool definitions (all default `enabled: false`)
- Declarative permission lookup
- Pure policy decision engine
- Lightweight validators
- Node.js built-in unit tests

## What is NOT implemented

- Model invocation
- Browser Use, Hermes, and MCP adapters
- Database, API, or UI within this package (the web app owns integration)
- Any enabled adapter in the default tool catalog

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

TypeScript is a development dependency. Run:

```text
npm run typecheck
```

Do not add Browser Use or other execution adapters unless a task explicitly authorizes them.
