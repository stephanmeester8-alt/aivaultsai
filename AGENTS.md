# AIVaultsAI

## Project purpose

AIVaultsAI is a **designed** AI-powered operating system for discovering, designing, building, deploying, and optimizing AI workflows and agents for businesses.

This repository currently contains the **architectural foundation only**: contracts, agent definitions, security model, and Cursor rules.

**Status of this repository:** GREENFIELD.

No website, SaaS application, database, agent runtime, tool runtime, or Browser Use integration is implemented.

## Greenfield status

| Item | Status |
|---|---|
| Architecture contracts | DESIGNED |
| Specialist agent definitions | DESIGNED |
| Orchestration lifecycle | DESIGNED |
| Tool and permission model | DESIGNED |
| Agent runtime | NOT IMPLEMENTED |
| Tool execution | NOT IMPLEMENTED |
| Browser Use | NOT IMPLEMENTED |
| Database | NOT IMPLEMENTED |
| Website / SaaS | NOT IMPLEMENTED |
| External API connections | NOT IMPLEMENTED |

Claims of capability must match this table. Do not describe planned components as if they exist.

## Repository boundaries

Work only inside:

```text
C:\aivaultsai-new
```

Git remote:

```text
https://github.com/stephanmeester8-alt/aivaultsai.git
```

Agents must not access repositories outside the current workspace.

Do not inspect, copy from, or depend on:

- `C:\aivaultsai`
- `C:\AIVaults`
- VoyageAgent
- any other local or remote repository unless a later task explicitly names it **and** it is inside this workspace

Do not create `apps/`, `packages/`, `database/`, infrastructure, production frontend, or backend implementation unless a later task explicitly authorizes them.

## Architecture principles

Agents reason and delegate.

Tools execute actions.

The orchestrator controls coordination.

The policy engine controls permissions.

Evidence records what actually happened.

Human approval is required for high-risk actions.

Keep these boundaries explicit:

- AGENT ≠ TOOL
- AGENT ≠ BROWSER
- AGENT ≠ PERMISSION
- AGENT ≠ ORCHESTRATOR

Hermes is an external/local agent runtime that may eventually connect to this orchestration layer. It is not defined as a specialist agent in this repository.

Browser Use is a browser-execution **capability/tool**. It is not an agent.

## Agent roles

Five specialist agents are **defined**, not implemented:

| ID | Name | Primary question |
|---|---|---|
| `cto-architect` | CTO / AI Systems Architect | What should we build and how should it be architected? |
| `research-intelligence` | Research Intelligence Agent | What do we actually know, and what evidence supports it? |
| `product-ux` | Product / UX Agent | What should we build for the customer and why will they use it? |
| `principal-engineer` | Principal AI Full-Stack Engineer | How do we implement this correctly? |
| `growth-analytics` | Growth / Analytics Agent | What is working and how can we improve it? |

Every agent must eventually conform to `AgentDefinition`. See `agents/contracts/agent-definition.md`.

## Task lifecycle

Designed lifecycle (not implemented):

```text
TASK CREATED
→ CLASSIFY
→ ASSIGN AGENT
→ PLAN
→ POLICY CHECK
→ EXECUTE TOOLS
→ COLLECT RESULTS
→ VERIFY
→ CREATE EVIDENCE
→ HANDOFF
→ HUMAN APPROVAL WHEN REQUIRED
→ COMPLETE
```

Task statuses: `BACKLOG`, `READY`, `IN_PROGRESS`, `BLOCKED`, `REVIEW`, `DONE`, `FAILED`.

See `docs/architecture/orchestration.md` and `agents/contracts/task.md`.

## Handoff rules

A handoff is a structured engineering artifact, not a chat message.

Required content: objective, completed work, findings, decisions, evidence, risks, open questions, and recommended next action.

See `agents/contracts/handoff.md`.

## Evidence rules

Research must be evidence-driven.

- Agents must not invent evidence.
- Agents must not claim successful execution without execution evidence.
- Separate facts from inference.
- Record source, provenance, confidence, and epistemic type.

Allowed confidence: `HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`.

Allowed epistemic types: `FACT`, `COMPANY_CLAIM`, `INDEPENDENTLY_VERIFIED`, `INFERENCE`, `HYPOTHESIS`, `ASSUMPTION`, `UNKNOWN`.

See `agents/contracts/evidence.md`.

## Security rules

Every tool invocation must eventually pass through:

```text
AGENT → POLICY CHECK → PERMISSION CHECK → TOOL EXECUTION → RESULT → EVIDENCE / AUDIT
```

- Agents must not bypass permission checks.
- Agents must not use browser capabilities without authorization.
- Agents must not expose secrets.
- High-risk and critical actions require human approval.

See `docs/security/agent-permissions.md`.

## Forbidden behavior

- Work outside `C:\aivaultsai-new`.
- Inspect unrelated repositories.
- Invent test results, execution results, or evidence.
- Claim a capability is implemented when it is only designed or planned.
- Bypass the policy or permission model.
- Use browser capabilities without authorization.
- Expose secrets, API keys, tokens, or credentials.
- Install dependencies without justification in the current task.
- Build the website, SaaS, database, Browser Use integration, or runtime before a later task authorizes it.
- Connect external APIs or create API keys unless a later task explicitly authorizes it.
