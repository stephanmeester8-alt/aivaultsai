/**
 * Digital Employee — SkillExecutionRouter (Sprint 2).
 *
 * Eén fail-closed execution pipeline bovenop de Sprint 1-contracten.
 * GEEN derde policy/approval/toolregistry-systeem: de router hergebruikt
 * ToolRegistryV2, de bestaande ApprovalGate en de bestaande recorder.
 *
 * Keten per skill-execution:
 *   resolve skill → assert tenant → schema-validatie → policy (permissions)
 *   → risk (R0-R4) → approval (R4/REQUIRED ⇒ gate) → skill.execute met
 *   ToolGateway → recorder/audit (altijd) → genormaliseerd resultaat.
 *
 * ToolGateway per tool-call:
 *   allowedTools (skill) → registry (bestaan/enabled/tenant) → policy
 *   (spec.permissions ⊆ skill.permissions) → approval (tool-policy) →
 *   gebonden executor → recorder. DENY beats ALLOW; unknown → fail closed.
 */

import { createHash, randomUUID } from "node:crypto";

import type { ApprovalGate } from "../approvals/approval-gate.ts";
import type { MetricRecorder, ToolCallRecord } from "../observability/metrics.ts";
import { ToolRegistryV2 } from "../tool-registry/registry.ts";
import { recordedCall } from "../tool-registry/recorded-call.ts";
import { approvalRequiredForRiskClass, riskLevelForRiskClass } from "./risk.ts";
import { SkillRegistry } from "./registry.ts";
import { validateSkillInput } from "./schema.ts";
import {
  assertTenantContext,
  type AgentContext,
  type AgentSkill,
  type SkillResult,
  type SkillToolOutcome,
} from "./types.ts";

export interface ToolExecutor {
  (input: unknown): Promise<{ ok: boolean; value?: unknown; error?: string }>;
}

export interface RouterDeps {
  skills: SkillRegistry;
  tools: ToolRegistryV2;
  /** Gebonden uitvoerders van bestaande adapters (toolId → execute). */
  executors: Readonly<Record<string, ToolExecutor>>;
  recorder?: MetricRecorder;
  /** Bestaande ApprovalGate; null/afwezig = fail-closed bij approval-eis. */
  approvalGate?: ApprovalGate | null;
  now?: () => string;
  log?: (message: string) => void;
}

export type RouterErrorCode =
  | "TENANT_REQUIRED"
  | "UNKNOWN_SKILL"
  | "INVALID_INPUT"
  | "POLICY_DENIED"
  | "APPROVAL_REQUIRED"
  | "TOOL_UNKNOWN"
  | "TOOL_NOT_ALLOWED"
  | "TOOL_DISABLED"
  | "TENANT_POLICY"
  | "TOOL_NOT_IMPLEMENTED"
  | "TOOL_APPROVAL_REQUIRED"
  | "EXECUTION_FAILED";

export type RouterOutcome =
  | { ok: true; executionId: string; value: unknown; evidenceRefs?: readonly string[] }
  | { ok: false; executionId: string; error: RouterErrorCode };

export interface ExecuteSkillInput {
  skillId: string;
  input: unknown;
  context: AgentContext;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorCodeOfSkillResult(result: SkillResult): RouterErrorCode {
  if (result.ok) return "EXECUTION_FAILED";
  const error = result.error;
  if (error === "TOOL_UNKNOWN") return "TOOL_UNKNOWN";
  if (error === "TOOL_NOT_ALLOWED") return "TOOL_NOT_ALLOWED";
  if (error === "TOOL_DISABLED") return "TOOL_DISABLED";
  if (error === "TENANT_POLICY") return "TENANT_POLICY";
  if (error === "TOOL_NOT_IMPLEMENTED") return "TOOL_NOT_IMPLEMENTED";
  if (error === "TOOL_APPROVAL_REQUIRED") return "TOOL_APPROVAL_REQUIRED";
  if (error === "POLICY_DENIED") return "POLICY_DENIED";
  if (error === "APPROVAL_REQUIRED") return "APPROVAL_REQUIRED";
  if (error === "INVALID_INPUT") return "INVALID_INPUT";
  return "EXECUTION_FAILED";
}

export async function executeSkill(deps: RouterDeps, request: ExecuteSkillInput): Promise<RouterOutcome> {
  const log = deps.log ?? ((message: string) => console.info(`[skill-router] ${message}`));
  const now = deps.now ?? (() => new Date().toISOString());
  const executionId = randomUUID();
  const { skillId, input, context } = request;

  const record = (status: "ALLOWED" | "DENIED" | "NOT_IMPLEMENTED" | "ERROR", errorCode: string | null, summary: string) => {
    if (!deps.recorder) return;
    try {
      void deps.recorder.recordCall({
        executionId,
        tenantId: context.tenantId ?? "unknown",
        agentId: context.agentId ?? "skill-router",
        sessionId: context.sessionId ?? null,
        toolId: `skill:${skillId}`,
        argumentsHash: sha256(JSON.stringify(input ?? {})),
        startedAt: now(),
        finishedAt: now(),
        status,
        riskLevel: "LOW",
        approvalId: context.approvalId ?? null,
        resultSummary: summary.slice(0, 200),
        errorCode,
        evidenceRefs: [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[skill-router] recorder failed (non-fatal): ${message.slice(0, 200)}`);
    }
  };

  // 1. Tenant-invariant (NO TENANT = NO EXECUTION).
  try {
    assertTenantContext(context);
  } catch {
    record("DENIED", "TENANT_REQUIRED", "TENANT_REQUIRED");
    return { ok: false, executionId, error: "TENANT_REQUIRED" };
  }

  // 2. Skill-resolutie (unknown → fail closed).
  const skill = deps.skills.get(skillId);
  if (!skill) {
    record("DENIED", "UNKNOWN_SKILL", "UNKNOWN_SKILL");
    return { ok: false, executionId, error: "UNKNOWN_SKILL" };
  }

  // 3. Inputvalidatie tegen het skill-contract.
  const issues = validateSkillInput(skill.inputSchema as Parameters<typeof validateSkillInput>[0], input);
  if (issues.length > 0) {
    record("DENIED", "INVALID_INPUT", `INVALID_INPUT: ${issues.join("; ")}`);
    return { ok: false, executionId, error: "INVALID_INPUT" };
  }

  // 4. Policy: skill.permissions moeten door de agent zijn toegestaan.
  const agentPermissions = context.agentPermissions ?? [];
  const missingPermissions = skill.permissions.filter((p) => !agentPermissions.includes(p));
  if (missingPermissions.length > 0) {
    record("DENIED", "POLICY_DENIED", `POLICY_DENIED: ${missingPermissions.join(",")}`);
    return { ok: false, executionId, error: "POLICY_DENIED" };
  }

  // 5. Risk/approval: R4 of REQUIRED ⇒ approval via de bestaande gate.
  const approvalRequired = approvalRequiredForRiskClass(skill.riskClass) || skill.approvalPolicy === "REQUIRED";
  let approvalOk = false;
  if (approvalRequired) {
    if (!deps.approvalGate) {
      record("DENIED", "APPROVAL_REQUIRED", "APPROVAL_REQUIRED (no gate)");
      return { ok: false, executionId, error: "APPROVAL_REQUIRED" };
    }
    const check = await deps.approvalGate.check({
      approvalId: context.approvalId ?? "",
      requestedAction: `skill:${skillId}`,
      now: now(),
    });
    if (!check.allowed) {
      record("DENIED", "APPROVAL_REQUIRED", `APPROVAL_REQUIRED: ${check.reason}`);
      return { ok: false, executionId, error: "APPROVAL_REQUIRED" };
    }
    approvalOk = true;
  }

  // 6. Gateway: de enige tool-toegangspoort voor de skill.
  const gateway = {
    execute: (toolId: string, toolInput: unknown): Promise<SkillToolOutcome> =>
      executeToolThroughGateway(deps, skill, toolId, toolInput, approvalOk, context, executionId),
  };

  // 7. Skill-execution (genormaliseerd) + recorder (altijd).
  const runContext: AgentContext = { ...context, tools: gateway, executionId };
  const result = await recordedCall(
    deps.recorder,
    {
      tenantId: context.tenantId,
      agentId: context.agentId ?? "skill-router",
      sessionId: context.sessionId ?? null,
      toolId: `skill:${skillId}`,
      riskLevel: riskLevelForRiskClass(skill.riskClass),
      argumentsHash: sha256(JSON.stringify(input ?? {})),
      approvalId: context.approvalId ?? null,
      executionId,
      now,
    },
    () => skill.execute(runContext, input),
  );

  // recordedCall retourneert het SkillResult van de skill zelf (bij een
  // onverwachte throw een {ok:false}-result met de foutmelding).
  if (!result.ok) {
    const error = typeof result.error === "string" && result.error.length > 0 ? result.error : "EXECUTION_FAILED";
    const code = errorCodeOfSkillResult({ ok: false, error });
    log(`skill ${skillId} failed (${executionId}): ${error.slice(0, 200)}`);
    return { ok: false, executionId, error: code };
  }

  return {
    ok: true,
    executionId,
    value: result.value,
    evidenceRefs: result.evidenceRefs,
  };
}

/**
 * Tool-call binnen een skill: allowedTools → registry → policy → approval
 * → executor → recorder. Fail-closed per laag; DENY beats ALLOW.
 */
async function executeToolThroughGateway(
  deps: RouterDeps,
  skill: AgentSkill,
  toolId: string,
  toolInput: unknown,
  skillApprovalOk: boolean,
  context: AgentContext,
  executionId: string,
): Promise<SkillToolOutcome> {
  const now = deps.now ?? (() => new Date().toISOString());

  // 1. De skill mag alleen zijn eigen allowedTools aanroepen.
  if (!skill.allowedTools.includes(toolId)) {
    return { ok: false, error: "TOOL_NOT_ALLOWED" };
  }
  // 2. Registry: tool moet bestaan en enabled zijn voor de tenant.
  const spec = deps.tools.get(toolId);
  if (!spec) return { ok: false, error: "TOOL_UNKNOWN" };
  if (!deps.tools.isEnabled(toolId, context.tenantId)) {
    return { ok: false, error: deps.tools.isTenantPolicyOff(toolId, context.tenantId) ? "TENANT_POLICY" : "TOOL_DISABLED" };
  }
  // 3. Adapter-beschikbaarheid (spec + gebonden executor).
  if (deps.tools.resolveAdapter(toolId) === null) return { ok: false, error: "TOOL_NOT_IMPLEMENTED" };
  const executor = deps.executors[toolId];
  if (!executor) return { ok: false, error: "TOOL_NOT_IMPLEMENTED" };

  // 4. Policy: de skill moet elke tool-permission bezitten.
  const missing = spec.permissions.filter((p) => !skill.permissions.includes(p));
  if (missing.length > 0) return { ok: false, error: "POLICY_DENIED" };

  // 5. Approval: tool-policy (R3/R4) vereist een goedgekeurde skill-run.
  if (deps.tools.approvalRequired(toolId, context.tenantId) && !skillApprovalOk) {
    return { ok: false, error: "TOOL_APPROVAL_REQUIRED" };
  }

  // 6. Uitvoering via de gebonden executor + recorder (altijd).
  const outcome = await recordedCall(
    deps.recorder,
    {
      tenantId: context.tenantId,
      agentId: context.agentId ?? "skill-router",
      sessionId: context.sessionId ?? null,
      toolId,
      riskLevel: spec.riskLevel,
      argumentsHash: sha256(JSON.stringify(toolInput ?? {})),
      approvalId: context.approvalId ?? null,
      executionId: `${executionId}:${toolId}`,
      now,
    },
    () => executor(toolInput),
  );

  if (outcome.ok) {
    return { ok: true, value: outcome.value };
  }
  const error = typeof outcome.error === "string" ? outcome.error : "EXECUTION_FAILED";
  return { ok: false, error };
}

/** Type-helper voor tests die ToolCallRecord-verzamelaars bouwen. */
export type { ToolCallRecord };
