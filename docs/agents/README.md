# Specialist agents

**Status:** Definitions: DESIGNED. Registry: IMPLEMENTED (in-memory `AgentRegistry` in `packages/agent-core`). Agent runtime: IMPLEMENTED (see `docs/architecture/runtime.md`) — drives tasks, policy, approvals, execution, evidence and handoffs through the existing engines. Model invocation / autonomous LLM reasoning: NOT IMPLEMENTED (agents do not call models; the runtime executes authorized tool actions).

These records are definitions. The runtime executes only explicitly registered, enabled, policy-allowed, approved actions.

## Roster

| ID | File | Role | Primary question |
|---|---|---|---|
| `cto-architect` | `agents/definitions/cto-architect.md` | CTO / AI Systems Architect | What should we build and how should it be architected? |
| `research-intelligence` | `agents/definitions/research-intelligence.md` | Research Intelligence Agent | What do we actually know, and what evidence supports it? |
| `product-ux` | `agents/definitions/product-ux.md` | Product / UX Agent | What should we build for the customer and why will they use it? |
| `principal-engineer` | `agents/definitions/principal-engineer.md` | Principal AI Full-Stack Engineer | How do we implement this correctly? |
| `growth-analytics` | `agents/definitions/growth-analytics.md` | Growth / Analytics Agent | What is working and how can we improve it? |

## Contract

Every agent must eventually conform to `agents/contracts/agent-definition.md`.

## Common constraints

- Agents reason and delegate. They do not execute tools directly.
- Allowed tools listed in definitions are **planned** capability names, not installed integrations.
- Prohibited tools remain prohibited even if a future runtime could technically invoke them.
- Handoffs must use `agents/contracts/handoff.md`.
- Claims require `Evidence` when `evidence_required` is true on the task.

## Not in this roster

| Name | Why |
|---|---|
| Hermes | External/local runtime, not a specialist agent in this repository |
| Browser Use | Tool/capability, not an agent |
| Orchestrator | Coordination component, not a specialist agent |

## Implementation status

| Capability | Status |
|---|---|
| Markdown definitions | DESIGNED (this directory; mirrored as typed constants in `packages/agent-core`) |
| Agent registry runtime | IMPLEMENTED (`AgentRegistry` in `packages/agent-core`) |
| Agent runtime (task → policy → approval → execution → evidence → handoff) | IMPLEMENTED (see `docs/architecture/runtime.md`) |
| Model invocation / autonomous reasoning | NOT IMPLEMENTED |
