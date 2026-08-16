# Evidence

**Status:** IMPLEMENTED as an in-memory `EvidenceStore` in `packages/agent-core`. No persistence. The store does not decide truth.

Research and execution claims must be evidence-driven.

Evidence records what was observed or reported. It does not record what an agent wishes were true.

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `evidenceId` | string | yes | Unique identifier |
| `claim` | string | yes | The statement this record supports or qualifies |
| `type` | `EvidenceType` | yes | Epistemic type. Never silently upgraded. |
| `source` | string | yes | Locator or label. Empty is invalid. `none` is explicit unknown. |
| `sourceType` | string | yes | Kind of source, e.g. `web_page`, `document`, `human` |
| `collectedAt` | datetime | yes | Collection timestamp (UTC, parseable) |
| `supportingData` | string | yes | Quotes, excerpts, or notes. Must not include secrets. |
| `counterEvidence` | string \| null | yes | Known conflicting data, or null |
| `confidence` | `Confidence` | yes | Does not change `type` |
| `provenance` | object | yes | How the data entered the system |
| `taskId` | string \| null | no | Optional task reference (Task 6) |
| `agentId` | `AgentId` \| null | no | Optional collecting agent (Task 6) |

## Provenance object

```text
{
  actor: string
  toolId: string | null
  capability: string | null
  method: string
  origin: manual | agent_research | browser | api | user | system
  executionOccurred: boolean
}
```

`origin` and `executionOccurred` are required when storing via `EvidenceStore`. They remain optional on the TypeScript type so older fixtures still type-check.

In this phase `executionOccurred` must be `false`. Browser origin is rejected because Browser Use is not installed.

See `docs/architecture/evidence-store.md`.

## Confidence

| Value | Meaning |
|---|---|
| `HIGH` | Direct, recent, primary, or independently corroborated |
| `MEDIUM` | Credible but incomplete, secondary, or not corroborated |
| `LOW` | Weak, stale, partial, or conflicted |
| `UNKNOWN` | Confidence cannot be assessed |

## Epistemic types

| Type | Meaning |
|---|---|
| `FACT` | Directly observed or independently established |
| `COMPANY_CLAIM` | A party asserting something about itself |
| `INDEPENDENTLY_VERIFIED` | Checked against an independent source |
| `INFERENCE` | Derived from other records; not directly observed |
| `HYPOTHESIS` | Testable but unverified |
| `ASSUMPTION` | Taken as given without evidence |
| `UNKNOWN` | Type not established |

The store never upgrades these types.

## Invariants

1. Agents must not invent evidence.
2. Agents must not claim successful execution without execution evidence.
3. `INFERENCE`, `HYPOTHESIS`, and `ASSUMPTION` must not be labeled `FACT`.
4. Missing source (`none` / `unknown`) ⇒ `confidence` cannot be `HIGH`.
5. `UNKNOWN` is valid. Fabrication is not.
6. Counter-evidence, when found, must be recorded rather than omitted.
7. Records are append-only. Corrections are new evidence records.

