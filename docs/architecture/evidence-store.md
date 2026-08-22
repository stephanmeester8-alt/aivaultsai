# Evidence Store

**Status:** IMPLEMENTED as an in-memory store in `packages/agent-core`. It does not browse, execute tools, or decide whether a claim is true. Real execution evidence (`executionOccurred: true`) is accepted only with a gate `executionId`; manual execution claims are rejected.

## Evidence model

Evidence is a stored record of a claim plus source, type, confidence, and provenance.

Evidence is **not** the same as truth. The store does not upgrade types and does not silently repair invalid records.

Task 6 added optional fields to the Task 2 `Evidence` contract:

| Field | Meaning |
|---|---|
| `taskId` | Optional task this record is attached to |
| `agentId` | Optional collecting agent |
| `provenance.origin` | How the record entered the system |
| `provenance.executionOccurred` | Whether a tool actually ran |

There is no separate database relation. These are fields on the evidence record.

## Evidence types

`FACT` | `COMPANY_CLAIM` | `INDEPENDENTLY_VERIFIED` | `INFERENCE` | `HYPOTHESIS` | `ASSUMPTION` | `UNKNOWN`

The store never changes the submitted type. `INFERENCE` stays `INFERENCE`. `HYPOTHESIS` is never stored as `FACT`. `COMPANY_CLAIM` is never stored as `INDEPENDENTLY_VERIFIED`.

## Confidence

`HIGH` | `MEDIUM` | `LOW` | `UNKNOWN`

Confidence does not change type. `INFERENCE` + `HIGH` is valid and remains an inference.

`HIGH` is rejected when `source` is `none` or `unknown`.

## Source

`source` must be an explicit non-empty string (website, documentation, case study, GitHub, interview, article, user-provided, or `none`).

A source existing does not make it authoritative.

## Provenance

`origin` must be one of: `manual`, `agent_research`, `browser`, `api`, `user`, `system`.

Rules in this phase:

- `executionOccurred: true` is accepted only as real execution evidence (provenance carries the gate `executionId`); without execution, execution claims cannot be `FACT` / `INDEPENDENTLY_VERIFIED`.
- `origin: browser` and `toolId: browser` are rejected. Browser Use is not installed; browser provenance cannot be fabricated as execution.
- `actor`, `method` required; `toolId` and `capability` may be null.

## Task and agent relationship

Optional `taskId` / `agentId` support `listByTask` and `listByAgent`. Filters are exact-match only. No embeddings or semantic search.

If `agentId` is set, it must be a valid `AgentId`.

## Immutability

No `updateEvidence` or `deleteEvidence`. Records are append-only. Corrections are new records. Callers receive copies.

## Execution evidence

A claim such as "Browser opened website" or "File uploaded" cannot be stored as `FACT` or `INDEPENDENTLY_VERIFIED` without execution. It may be stored as `HYPOTHESIS` / `INFERENCE` / `ASSUMPTION` with `executionOccurred: false`. When a tool actually ran through the Execution Gate, the runtime records real execution evidence (`FACT`, `executionOccurred: true`, provenance `executionId`).

## Limitations

- In-memory only; persistence is provided via the runtime recorder (migration `002_agent_runtime.sql`, `runtime_evidence`)
- No semantic duplicate detection
- No verification that a source URL was fetched
- Does not prove claims true
- Does not execute Browser Use, APIs, or tools
