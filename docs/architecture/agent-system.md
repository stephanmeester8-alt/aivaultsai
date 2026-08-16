# Agent system architecture

**Status:** DESIGNED. Runtime: NOT IMPLEMENTED.

## Purpose

AIVaultsAI coordinates specialist agents that reason and delegate. Tools execute. The orchestrator coordinates. The policy engine authorizes. Evidence records what happened.

This document defines the intended system shape. It does not describe a running system.

## System map

```text
AIVAULTSAI
│
├── Agent Orchestrator
│
├── Agent Registry
│
├── Task Engine
│
├── Handoff System
│
├── Evidence System
│
├── Policy / Permission Engine
│
├── Tool Registry
│   │
│   ├── Browser
│   ├── Filesystem
│   ├── Terminal
│   ├── APIs
│   └── MCP
│
└── Specialist Agents
    │
    ├── CTO / AI Architect
    ├── Research Intelligence
    ├── Product / UX
    ├── Principal AI Engineer
    └── Growth / Analytics
```

## Component responsibilities

| Component | Responsibility | Status |
|---|---|---|
| Agent Orchestrator | Classify tasks, assign agents, sequence steps, require approval when needed | IMPLEMENTED (coordination only; stops at READY_FOR_EXECUTION) |
| Agent Registry | Store `AgentDefinition` records and resolve agents by `id` | IMPLEMENTED (in-memory, `packages/agent-core`) |
| Task Engine | Create and transition `Task` records | IMPLEMENTED (in-memory, `packages/agent-core`) |
| Handoff System | Transfer structured work between agents | IMPLEMENTED (in-memory, `packages/agent-core`) |
| Evidence System | Record claims, sources, confidence, and provenance | IMPLEMENTED (in-memory, `packages/agent-core`) |
| Policy / Permission Engine | Authorize tool invocations by agent, tool, capability, and risk | IMPLEMENTED (decision only, `evaluatePolicy`) |
| Tool Registry | Store `ToolDefinition` records; tools execute, agents do not | IMPLEMENTED (in-memory catalog; all default tools disabled) |
| Specialist Agents | Reason, plan, and delegate within their contract | DESIGNED |

## Hard boundaries

| Boundary | Meaning |
|---|---|
| AGENT ≠ TOOL | An agent reasons and delegates. It does not itself execute browser, filesystem, terminal, API, or MCP actions. |
| AGENT ≠ BROWSER | Browser Use is a tool capability behind the policy engine. It is not an agent. |
| AGENT ≠ PERMISSION | Agents cannot grant themselves permissions. The policy engine decides. |
| AGENT ≠ ORCHESTRATOR | Agents do not assign work across the system. The orchestrator does. |

## External runtimes and tools

| Name | Classification | Status |
|---|---|---|
| Hermes | External/local agent runtime that may later connect to this orchestration and tool layer | PLANNED connection; not part of this repository |
| Browser Use | Browser-execution capability/tool | PLANNED; not installed |

Neither Hermes nor Browser Use is a specialist agent in this system.

## Specialist agents

Definitions live in `agents/definitions/`. Index: `docs/agents/README.md`.

Each agent must eventually conform to `agents/contracts/agent-definition.md`.

Executable TypeScript ids are snake_case (`cto_architect`, `research_intelligence`, `product_ux`, `principal_engineer`, `growth_analytics`). Markdown ids from Task 1 remain kebab-case. Use the TypeScript `AgentId` values in code.

## Typed domain contracts (Task 2)

`packages/agent-core` implements the first executable contracts: types, five agent definitions, an in-memory `AgentRegistry`, conceptual `ToolDefinition` records, and declarative permission boundaries.

That package does not execute tools, install Browser Use, persist data, or run an orchestrator. Browser remains `enabled: false`. `evaluatePolicy` authorizes requests; it does not execute them. See `docs/security/policy-engine.md`.

## Contracts

| Contract | Path |
|---|---|
| AgentDefinition | `agents/contracts/agent-definition.md` |
| Task | `agents/contracts/task.md` |
| Handoff | `agents/contracts/handoff.md` |
| Evidence | `agents/contracts/evidence.md` |
| ToolDefinition | `agents/contracts/tool-definition.md` |
| Approval | `agents/contracts/approval.md` |

## What this document does not authorize

- Implementing the orchestrator or runtimes
- Installing Browser Use or other tools
- Connecting APIs
- Building a product UI or database
