# AIVaultsAI Engineering Guide

## Project purpose

AIVaultsAI is an AI-powered platform for discovering, designing, building, deploying, and optimizing AI workflows and agents for businesses.

The repository now contains the first public website and a live commercial AI assistant, plus the architectural foundation for the future agent platform.

**Current status:** Customer Zero / early product validation.

The project must distinguish between:

- implemented and deployed functionality;
- designed architecture;
- planned functionality.

Claims must match evidence.

## Customer Zero

AIVaultsAI is its own first customer.

The public website at `aivaultsai.one` is the first production-like environment used to validate acquisition, AI conversations, lead capture, qualification, follow-up, and conversion workflows.

See:

- `docs/customer-zero/README.md`
- `docs/customer-zero/measurement.md`

The product-learning loop is:

```text
OBSERVE → MEASURE → ANALYZE → CHANGE → RE-TEST → DOCUMENT
```

No business result may be claimed without actual measurement evidence.

## Repository boundaries

Work only inside:

```text
C:\aivaultsai-new
```

Git remote:

```text
https://github.com/stephanmeester8-alt/aivaultsai.git
```

Do not inspect, copy from, or depend on unrelated repositories unless explicitly authorized for a task.

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

Hermes is an external/local agent runtime that may eventually connect to this orchestration layer. It is not a specialist agent in this repository.

Browser Use is a browser-execution capability/tool. It is not an agent.

## Agent roles

Five specialist agents are defined in the architecture:

| ID | Name | Primary question |
|---|---|---|
| `cto-architect` | CTO / AI Systems Architect | What should we build and how should it be architected? |
| `research-intelligence` | Research Intelligence Agent | What do we actually know, and what evidence supports it? |
| `product-ux` | Product / UX Agent | What should we build for the customer and why will they use it? |
| `principal-engineer` | Principal AI Full-Stack Engineer | How do we implement this correctly? |
| `growth-analytics` | Growth / Analytics Agent | What is working and how can we improve it? |

These definitions describe roles; they must not be represented as autonomous production agents unless the runtime is actually implemented and verified.

## Task lifecycle

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

## Evidence rules

Research and product claims must be evidence-driven.

- Never invent evidence.
- Never claim successful execution without execution evidence.
- Separate facts from inference.
- Record source, provenance, confidence, and epistemic type where applicable.

Allowed confidence: `HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`.

Allowed epistemic types: `FACT`, `COMPANY_CLAIM`, `INDEPENDENTLY_VERIFIED`, `INFERENCE`, `HYPOTHESIS`, `ASSUMPTION`, `UNKNOWN`.

## Security rules

Every tool invocation must eventually pass through:

```text
AGENT → POLICY CHECK → PERMISSION CHECK → TOOL EXECUTION → RESULT → EVIDENCE / AUDIT
```

- Agents must not bypass permission checks.
- Agents must not use browser capabilities without authorization.
- Agents must not expose secrets.
- High-risk and critical actions require human approval.

## Website / assistant truthfulness

The public assistant may explain what AIVaultsAI can build, but it must not claim that an integration or automation exists unless that integration is actually connected and verified.

Current assistant behavior is implemented in `apps/web/app/api/assistant/route.ts`.

The website entry point is `apps/web/app/page.tsx`.

## Forbidden behavior

- Work outside `C:\aivaultsai-new`.
- Inspect unrelated repositories without explicit authorization.
- Invent test results, execution results, customer results, or evidence.
- Claim planned functionality is implemented.
- Bypass policy or permission controls.
- Expose secrets, API keys, tokens, or credentials.
- Install dependencies without justification.
