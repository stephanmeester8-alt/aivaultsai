/**
 * Autonomous Employee — registry-adapter (TASK 15, migratiestap 1–2).
 *
 * De employee werkt uitsluitend via deze laag: toolId → registry-checks
 * (fail-closed) → gebonden bestaande implementatie (tools.ts) → resultaat.
 * De orchestrator blijft voorlopig ongewijzigd; deze adapter is de brug die
 * later door de ExecutionGate wordt vervangen (implementatietaak gate).
 *
 * Fail-closed:
 * - onbekende tool (niet in registry)      → DENY (UNKNOWN_TOOL)
 * - disabled tool / tenantPolicy OFF       → DENY (TOOL_DISABLED / TENANT_POLICY)
 * - adapter ontbreekt of handler ontbreekt → NOT_IMPLEMENTED
 * - budget (TASK 16): check vóór de call; budget op = STOP (fail-closed)
 * - handler-fout                            → gecontroleerde fout (geen retry)
 *
 * Observability (TASK 24): ELKE call (ALLOWED/DENIED/NOT_IMPLEMENTED/ERROR)
 * levert één tool-call-record via ctx.recorder (optioneel; no-op zonder).
 * Budget-stop telt ook agent_budget_exceeded_total.
 */

import { createHash, randomUUID } from "node:crypto";

import type { ToolRegistryV2 } from "../tool-registry/registry.ts";
import { executeEmailDraft } from "../tool-registry/adapters/email-draft.ts";
import type { EmailSql } from "../email/draft-repository.ts";
import type { EmployeeBudgetTracker } from "./budget.ts";
import {
  discoverProspects,
  qualifyProspect,
  researchCompanyWebsite,
  type ToolResult,
} from "./tools.ts";
import type { EmployeeToolContext } from "./types.ts";

export interface EmployeeToolExecution {
  ok: boolean;
  value?: unknown;
  error?: string;
  policy: {
    toolId: string;
    allowed: boolean;
    reason?: string;
  };
}

/** Gebonden handlers: bestaande employee-tools achter hun ToolSpec (TASK 15 §3). */
function makeEmployeeToolHandlers(tracker?: EmployeeBudgetTracker): Readonly<
  Record<string, (input: unknown, ctx: EmployeeToolContext) => Promise<ToolResult<unknown>>>
> {
  return {
    employee_discovery: async (input, ctx) => discoverProspects(input, ctx) as Promise<ToolResult<unknown>>,
    employee_website_research: async (input, ctx) => {
      // Netwerk-teller (TASK 16): fetch-invocaties binnen deze tool tellen mee.
      const ctxWithNetworkCount =
        tracker && ctx.fetchImpl
          ? {
              ...ctx,
              fetchImpl: (async (fetchInput: RequestInfo | URL, init?: RequestInit) => {
                tracker.recordNetworkRequest();
                return ctx.fetchImpl!(fetchInput, init);
              }) as typeof fetch,
            }
          : ctx;
      return researchCompanyWebsite(input, ctxWithNetworkCount) as Promise<ToolResult<unknown>>;
    },
    employee_qualify: async (input, ctx) => qualifyProspect(input, ctx) as Promise<ToolResult<unknown>>,
    // Centrale email_draft-adapter (TASK 18): de employee-ctx.sql is de opslag.
    email_draft: async (input, ctx) => {
      const result = await executeEmailDraft(input, {
        sql: ctx.sql as EmailSql,
        tenantId: ctx.tenantId,
        now: ctx.now,
        log: ctx.log,
      });
      // Employee-zijde permission (TASK 15 §6): outreach.draft; centrale tool gebruikt EMAIL_DRAFT.
      const toolResult: ToolResult<unknown> = {
        ok: result.ok,
        value: result.value,
        error: result.error,
        policy: { permission: "outreach.draft", allowed: result.ok, reason: result.error },
      };
      return toolResult;
    },
    // employee_database_read / employee_database_write: adapters volgen in
    // een latere implementatietaak (na de gate).
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function executeEmployeeTool(
  toolId: string,
  input: unknown,
  ctx: EmployeeToolContext,
  registry: ToolRegistryV2,
  tracker?: EmployeeBudgetTracker,
): Promise<EmployeeToolExecution> {
  const spec = registry.get(toolId);

  // Fail-closed keten + observability: elke uitkomst wordt geregistreerd
  // (TASK 24) — non-fatal: een recorder-fout verandert nooit de beslissing.
  const run = async (): Promise<EmployeeToolExecution> => {
    if (!spec) {
      return {
        ok: false,
        error: "UNKNOWN_TOOL",
        policy: { toolId, allowed: false, reason: "UNKNOWN_TOOL" },
      };
    }
    if (!registry.isEnabled(toolId, ctx.tenantId)) {
      // TASK 25: rij = OFF → TENANT_POLICY (fail-closed DENY); anders disabled.
      const reason = registry.isTenantPolicyOff(toolId, ctx.tenantId) ? "TENANT_POLICY" : "TOOL_DISABLED";
      return {
        ok: false,
        error: reason,
        policy: { toolId, allowed: false, reason },
      };
    }
    if (registry.resolveAdapter(toolId) === null) {
      return {
        ok: false,
        error: "NOT_IMPLEMENTED",
        policy: { toolId, allowed: false, reason: "NOT_IMPLEMENTED" },
      };
    }

    // Budget (TASK 16): check vóór de call; budget op = STOP (fail-closed).
    if (tracker) {
      const check = tracker.check();
      if (!check.ok) {
        try {
          ctx.recorder?.recordBudgetExceeded("autonomous-employee", check.field);
        } catch {
          /* observability-only: nooit in het beslissingspad */
        }
        return {
          ok: false,
          error: "BUDGET_EXCEEDED",
          policy: {
            toolId,
            allowed: false,
            reason: `BUDGET_EXCEEDED:${check.field}`,
          },
        };
      }
      // Elke poging telt (ook als de handler daarna DENY'd) — anti-loop.
      tracker.recordToolCall(toolId);
    }

    const handler = makeEmployeeToolHandlers(tracker)[toolId];
    if (!handler) {
      // Bekend in de registry met adapter, maar nog niet gebonden → fail-closed.
      return {
        ok: false,
        error: "NOT_IMPLEMENTED",
        policy: { toolId, allowed: false, reason: "ADAPTER_NOT_BOUND" },
      };
    }

    const result = await handler(input, ctx);
    return {
      ok: result.ok,
      value: result.value,
      error: result.error,
      policy: {
        toolId,
        allowed: result.ok,
        reason: result.ok ? undefined : result.error,
      },
    };
  };

  // Wrap: één ToolCallRecord per call (argumentsHash only — nooit ruwe input).
  const recorder = ctx.recorder;
  if (!recorder) return run();

  return run().then((outcome) => {
    const now = ctx.now ?? (() => new Date().toISOString());
    const startedAt = now();
    try {
      void recorder.recordCall({
        executionId: randomUUID(),
        tenantId: ctx.tenantId,
        agentId: "autonomous-employee",
        sessionId: null,
        toolId,
        argumentsHash: sha256(JSON.stringify(input ?? {})),
        startedAt,
        finishedAt: now(),
        status: outcome.error === "NOT_IMPLEMENTED"
          ? "NOT_IMPLEMENTED"
          : outcome.ok
            ? "ALLOWED"
            : outcome.error === "UNKNOWN_TOOL" ||
                outcome.error === "TOOL_DISABLED" ||
                outcome.error === "TENANT_POLICY" ||
                outcome.error === "BUDGET_EXCEEDED"
              ? "DENIED"
              : "ERROR",
        riskLevel: spec?.riskLevel ?? "MEDIUM",
        approvalId: null,
        resultSummary: outcome.ok ? "ok" : (outcome.error ?? "failed"),
        errorCode: outcome.ok ? null : (outcome.error ?? "ERROR"),
        evidenceRefs: [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[observability] recorder failed (non-fatal): ${message.slice(0, 200)}`);
    }
    return outcome;
  });
}
