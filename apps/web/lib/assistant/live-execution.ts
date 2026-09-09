/**
 * Live Assistant — Unified Live Execution (Sprint 4).
 *
 * Doel: de live /api/assistant voert tool-capabilities uitsluitend uit via
 * de centrale Sprint 1-3-pipeline — géén directe adapter-bypass:
 *
 *   tool-call (LLM)
 *     → deterministische skill-selectie (geen LLM-router in V1)
 *     → SkillExecutionRouter (executeSkill)
 *     → tenant-invariant → schema → policy → risk/approval
 *     → ToolRegistryV2-gateway → gebonden executor → recorder
 *     → genormaliseerd AssistantToolExecution-resultaat
 *
 * Refactor, geen rewrite: bestaande componenten (router, registry's,
 * executors, recorder, ApprovalGate, executeAssistantToolCall als
 * gebonden adapter) worden HERGEBRUIKT. Er komt geen tweede runtime.
 *
 * Determinisme: V1 selecteert skills op basis van de tool-call van het
 * model. `assistant_website_research` → `company.research` (R1, read-only,
 * SSRF-guarded). Elke andere tool-call bestaat niet in de live-catalogus →
 * UNKNOWN_TOOL (fail-closed). LLM-intelligente skill-routing komt later.
 */

import type { AssistantToolExecution } from "../agent-runtime/runtime-adapter.ts";
import type { ObservabilitySql } from "../observability/postgres-recorder.ts";
import { PostgresRecorder } from "../observability/postgres-recorder.ts";
import type { MetricRecorder } from "../observability/metrics.ts";
import type { ApprovalGate } from "../approvals/approval-gate.ts";
import { createDefaultToolRegistry } from "../tool-registry/tools.ts";
import type { ToolRegistryV2 } from "../tool-registry/registry.ts";
import { createProductionExecutors, type LiveExecutorOptions } from "../skills/executors.ts";
import { createSkillRegistry, type SkillRegistry } from "../skills/registry.ts";
import { createCompanyResearchSkill } from "../skills/definitions.ts";
import { executeSkill, type RouterDeps, type RouterOutcome, type ToolExecutor } from "../skills/router.ts";
import type { AgentContext } from "../skills/types.ts";
import type { ParsedToolCall } from "./tool-loop.ts";

export const LIVE_RESEARCH_TOOL_ID = "assistant_website_research";

/** Tenant + conversation-context van de live request (server-side resolutie). */
export interface LiveCallContext {
  /** Verplicht: NO TENANT = NO EXECUTION. */
  tenantId: string;
  conversationId?: string | null;
  sessionId?: string | null;
  /** Permissies van de live website-assistent (policy-check van de router). */
  agentPermissions?: readonly string[];
}

export interface LiveExecutionOptions {
  /** Recorder-sql (productie: de request-DB-client). Ontbreekt → no-op. */
  sql?: ObservabilitySql;
  /** Expliciete recorder (tests) — wint van sql. */
  recorder?: MetricRecorder;
  /** Test-injecties (skills/tools/executors/gate); default = productie. */
  skills?: SkillRegistry;
  tools?: ToolRegistryV2;
  executors?: Readonly<Record<string, ToolExecutor>>;
  approvalGate?: ApprovalGate | null;
  now?: () => string;
  log?: (message: string) => void;
  /** Extra opties voor de productie-executors (bv. DNS-lookup in tests). */
  executorOptions?: LiveExecutorOptions;
}

/** V1-skill-selectie: tool-call van het model → expliciete skill + input. */
export function selectLiveSkill(
  call: Pick<ParsedToolCall, "name" | "arguments">,
): { skillId: string; input: unknown } | null {
  if (call.name !== LIVE_RESEARCH_TOOL_ID) return null;

  let url: string | undefined;
  try {
    const parsed = JSON.parse(call.arguments) as { url?: unknown };
    if (typeof parsed.url === "string") url = parsed.url.trim();
  } catch {
    url = undefined;
  }

  return {
    skillId: "company.research",
    // Schema-validatie van de router vangt een ontbrekende/lege url af
    // (INVALID_INPUT, fail-closed); hier wordt niets uitgevoerd.
    input: { websiteUrl: url ?? "" },
  };
}

/** Router-deps voor de live assistent (per request; recorder aan request-sql). */
export function createLiveRouterDeps(
  context: LiveCallContext,
  options: LiveExecutionOptions = {},
): RouterDeps {
  const recorder: MetricRecorder | undefined =
    options.recorder ?? (options.sql ? new PostgresRecorder(options.sql) : undefined);

  return {
    skills: options.skills ?? createSkillRegistry([createCompanyResearchSkill()]),
    tools: options.tools ?? createDefaultToolRegistry(),
    executors: options.executors ?? createProductionExecutors({ tenantId: context.tenantId, ...(options.executorOptions ?? {}) }),
    recorder,
    approvalGate: options.approvalGate ?? null, // publieke site: geen approvals; R4/REQUIRED ⇒ fail-closed APPROVAL_REQUIRED
    now: options.now,
    log: options.log,
  };
}

/** AgentContext voor de live site-assistent (deterministisch, fail-closed). */
export function buildLiveAgentContext(context: LiveCallContext): AgentContext {
  return {
    tenantId: context.tenantId,
    conversationId: context.conversationId ?? null,
    sessionId: context.sessionId ?? null,
    agentId: "website_assistant",
    agentPermissions: context.agentPermissions ?? ["API_REQUEST"],
  };
}

/** RouterOutcome → AssistantToolExecution (tool-loop-contract, BEFORE≈AFTER). */
export function toAssistantExecution(outcome: RouterOutcome): AssistantToolExecution {
  if (outcome.ok) {
    return {
      ok: true,
      output: outcome.value ?? null,
      error: null,
      executionStatus: "SUCCEEDED",
      evidenceIds: [...(outcome.evidenceRefs ?? [])],
    };
  }
  // Fail-closed router-codes komen als fout bij het model (het model mag
  // nooit interne redenen zien; bezoeker krijgt een eerlijk "niet gelukt").
  return {
    ok: false,
    output: null,
    error: outcome.error,
    executionStatus: "REJECTED",
    evidenceIds: [],
  };
}

/**
 * Unified live tool-execution: EÉN tool-call van het model door de volledige
 * Sprint 1-3-pipeline. Nooit directe adapter-uitvoering.
 */
export async function executeLiveAssistantToolCall(
  call: Pick<ParsedToolCall, "callId" | "name" | "arguments">,
  context: LiveCallContext,
  options: LiveExecutionOptions = {},
): Promise<AssistantToolExecution> {
  const log = options.log ?? ((message: string) => console.info(`[live-assistant] ${message}`));
  log(`tool_requested name=${call.name} call_id=${call.callId}`);

  // 1. Deterministische skill-selectie (geen LLM-router in V1).
  const selected = selectLiveSkill(call);
  if (!selected) {
    log(`tool_unknown name=${call.name} — geen live-skill voor deze tool`);
    return {
      ok: false,
      output: null,
      error: "UNKNOWN_TOOL",
      executionStatus: "REJECTED",
      evidenceIds: [],
    };
  }

  // 2. Router-execution met tenant/context (NO TENANT = NO EXECUTION).
  const deps = createLiveRouterDeps(context, options);
  const agentContext = buildLiveAgentContext(context);
  const outcome = await executeSkill(deps, {
    skillId: selected.skillId,
    input: selected.input,
    context: agentContext,
  });

  log(
    `tool_execution_finished name=${call.name} ok=${outcome.ok} execution_id=${outcome.executionId} error=${outcome.ok ? "none" : outcome.error}`,
  );
  return toAssistantExecution(outcome);
}
