# AgentDefinition

**Status:** DESIGNED. Runtime validation: NOT IMPLEMENTED.

Every specialist agent must eventually conform to this contract. This file is the schema, not an executable type.

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Stable identifier, kebab-case, unique in the registry |
| `name` | string | yes | Human-readable name |
| `role` | string | yes | Functional role title |
| `mission` | string | yes | One-sentence mission |
| `capabilities` | string[] | yes | Reasoning and domain capabilities this agent may exercise |
| `allowed_tools` | string[] | yes | Tool ids or capability names this agent may request. Empty means none. |
| `prohibited_tools` | string[] | yes | Tool ids or capability names this agent must never request |
| `input_schema` | object | yes | Expected task input shape |
| `output_schema` | object | yes | Expected output shape |
| `handoff_targets` | string[] | yes | Agent ids this agent may hand off to |
| `risk_level` | `RiskLevel` | yes | Typical risk of this agent's work. Action risk may be higher. |

## RiskLevel

`LOW` | `MEDIUM` | `HIGH` | `CRITICAL`

## Invariants

1. `id` is immutable after publication.
2. `allowed_tools` ∩ `prohibited_tools` must be empty.
3. A tool not listed in `allowed_tools` is denied.
4. `handoff_targets` must reference registered agent ids, or be empty.
5. Listing a tool in `allowed_tools` does not enable it. The tool must also exist, be `enabled`, and pass policy.
6. This contract does not grant permission to execute anything.

## Conceptual input_schema

```text
{
  task_id: string
  objective: string
  inputs: object
  constraints: object
  evidence_required: boolean
  risk_level: RiskLevel
}
```

Concrete agents may extend this object. They may not remove required fields.

## Conceptual output_schema

```text
{
  task_id: string
  summary: string
  artifacts: object
  findings: object[]
  decisions: object[]
  evidence_ids: string[]
  risks: object[]
  open_questions: string[]
  recommended_next_action: string
  handoff: Handoff | null
}
```

## Registry notes

The Agent Registry (DESIGNED, not implemented) is the source of truth for published definitions.

Markdown files in `agents/definitions/` are the current definition source. They are not a running registry.
