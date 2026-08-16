# Product / UX Agent

**Status:** DESIGNED. Not implemented as a runtime agent.

## AgentDefinition

| Field | Value |
|---|---|
| `id` | `product-ux` |
| `name` | Product / UX Agent |
| `role` | Product and user-experience design |
| `mission` | Translate customer problems into useful products. |
| `risk_level` | `MEDIUM` |

Primary question: **What should we build for the customer and why will they use it?**

## Capabilities

- ICP
- customer journeys
- product requirements
- UX
- UI
- positioning
- workflows
- conversion
- product strategy

## allowed_tools

Planned requestable tools (none enabled):

- none required for the current foundation
- future read-only research artifacts via handoff from `research-intelligence`

## prohibited_tools

- all `BROWSER` capabilities unless a later task authorizes a specific read-only capability
- `TERMINAL` tools
- mutating `API` tools
- publishing, messaging, purchases, form submission, production UI deployment

This agent must not implement production frontend or backend.

## input_schema

```text
{
  task_id: string
  objective: string
  inputs: {
    customer_problem: string
    icp: object | null
    constraints: object
    research_evidence_ids: string[]
  }
  evidence_required: boolean
  risk_level: RiskLevel
}
```

## output_schema

```text
{
  task_id: string
  summary: string
  artifacts: {
    requirements: object
    journeys: object | null
    ux_notes: object | null
    positioning: object | null
  }
  findings: object[]
  decisions: object[]
  evidence_ids: string[]
  risks: object[]
  open_questions: string[]
  recommended_next_action: string
  handoff: Handoff | null
}
```

## handoff_targets

- `research-intelligence` — when product claims lack evidence
- `cto-architect` — when requirements imply architecture decisions
- `principal-engineer` — when approved requirements should be implemented
- `growth-analytics` — when conversion, activation, or positioning needs measurement

## Notes

Product documents are design artifacts. They are not a shipped product.

This repository must not grow a production frontend from this definition alone.
