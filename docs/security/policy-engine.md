# Policy Decision Engine

**Status:** IMPLEMENTED as a pure authorization function in `packages/agent-core`. It does not execute tools.

## Purpose

The policy engine answers one question:

> Is this agent authorized to perform this requested tool action?

Possible decisions: `ALLOW`, `DENY`, `APPROVAL_REQUIRED`.

It does not access the filesystem, network, terminal, Browser Use, Hermes, or an LLM.

## Default deny

Unknown or incomplete input fails closed.

- Unknown agent → `DENY`
- Unknown tool → `DENY`
- Unknown permission → `DENY`
- Unknown risk level → `DENY`
- Empty permission set when the tool requires permissions → `DENY`
- Tool not in the agent's `allowedTools` → `DENY`
- The engine never defaults to `ALLOW`

## Permission evaluation

Order before any allow:

1. Agent exists and is `ACTIVE`
2. Tool exists
3. Tool is `enabled`
4. Tool is not in `prohibitedTools` and is in `allowedTools`
5. Agent has a required capability for that tool
6. Requested permissions are known, applicable to the tool, and allowed for the agent

`checkAgentPermission` remains a definition lookup. `evaluatePolicy` is the authorization decision.

## Risk evaluation

| Request risk | After permission checks pass |
|---|---|
| `LOW` | `ALLOW` |
| `MEDIUM` | `ALLOW` |
| `HIGH` | `APPROVAL_REQUIRED` unless a valid `APPROVED` approval is supplied |
| `CRITICAL` | same as `HIGH` |

Disabled tools are denied before risk is considered. Permission failures are denied before asking a human for approval.

## Approval evaluation

An approval is valid only when all of the following hold:

- `status === APPROVED`
- `approval.approvalId` matches `request.approvalId` when an id is present
- `approval.requestedBy` matches the requesting agent
- `approval.taskId` matches `request.taskId`
- `approval.riskLevel` is at least as high as the request risk

| Approval state | Decision for HIGH/CRITICAL |
|---|---|
| missing | `APPROVAL_REQUIRED` |
| claimed id but no record | `DENY` |
| `REJECTED` | `DENY` |
| `PENDING` or `EXPIRED` | `APPROVAL_REQUIRED` |
| `APPROVED` but mismatched | `DENY` |
| `APPROVED` and valid | `ALLOW` if earlier checks passed |

Arbitrary approval ids are not accepted.

Approval records are created and resolved by the in-memory `ApprovalEngine` (`docs/security/approval-engine.md`). The Policy Engine does not create or mutate approvals. A `HIGH` approval is not sufficient for a `CRITICAL` request (`isApprovalRiskSufficient`).

## Deterministic decisions

`evaluatePolicy(request, agentRegistry, toolRegistry, approval)` is a pure function.

Same inputs always produce the same `PolicyResult`. There is no model call, clock, environment variable, or I/O in the decision path.

## Policy vs execution

```text
Agent → Policy Decision Engine → ALLOW | DENY | APPROVAL_REQUIRED
```

`ALLOW` means the request is authorized, not that it ran. Tool adapters, Browser Use, and orchestrators are out of scope.

Production tool records remain `enabled: false`. Tests may register enabled copies to exercise authorization without installing or executing tools.

## Why LLMs must not make authorization decisions

Language models are non-deterministic and can be prompted into granting extra permissions. Authorization must stay a closed, reviewable ruleset. Agents may reason about what to request. They may not decide whether the request is allowed.
