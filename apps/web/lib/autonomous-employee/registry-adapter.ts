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
 * - disabled tool / tenantPolicy OFF       → DENY (TOOL_DISABLED)
 * - adapter ontbreekt of handler ontbreekt → NOT_IMPLEMENTED
 * - handler-fout                            → gecontroleerde fout (geen retry)
 */

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

export function executeEmployeeTool(
  toolId: string,
  input: unknown,
  ctx: EmployeeToolContext,
  registry: ToolRegistryV2,
  tracker?: EmployeeBudgetTracker,
): Promise<EmployeeToolExecution> {
  const spec = registry.get(toolId);
  if (!spec) {
    return Promise.resolve({
      ok: false,
      error: "UNKNOWN_TOOL",
      policy: { toolId, allowed: false, reason: "UNKNOWN_TOOL" },
    });
  }
  if (!registry.isEnabled(toolId, ctx.tenantId)) {
    // TASK 25: rij = OFF → TENANT_POLICY (fail-closed DENY); anders disabled.
    const reason = registry.isTenantPolicyOff(toolId, ctx.tenantId) ? "TENANT_POLICY" : "TOOL_DISABLED";
    return Promise.resolve({
      ok: false,
      error: reason,
      policy: { toolId, allowed: false, reason },
    });
  }
  if (registry.resolveAdapter(toolId) === null) {
    return Promise.resolve({
      ok: false,
      error: "NOT_IMPLEMENTED",
      policy: { toolId, allowed: false, reason: "NOT_IMPLEMENTED" },
    });
  }

  // Budget (TASK 16): check vóór de call; budget op = STOP (fail-closed).
  if (tracker) {
    const check = tracker.check();
    if (!check.ok) {
      return Promise.resolve({
        ok: false,
        error: "BUDGET_EXCEEDED",
        policy: {
          toolId,
          allowed: false,
          reason: `BUDGET_EXCEEDED:${check.field}`,
        },
      });
    }
    // Elke poging telt (ook als de handler daarna DENY'd) — anti-loop.
    tracker.recordToolCall(toolId);
  }

  const handler = makeEmployeeToolHandlers(tracker)[toolId];
  if (!handler) {
    // Bekend in de registry met adapter, maar nog niet gebonden → fail-closed.
    return Promise.resolve({
      ok: false,
      error: "NOT_IMPLEMENTED",
      policy: { toolId, allowed: false, reason: "ADAPTER_NOT_BOUND" },
    });
  }

  return handler(input, ctx).then((result) => ({
    ok: result.ok,
    value: result.value,
    error: result.error,
    policy: {
      toolId,
      allowed: result.ok,
      reason: result.ok ? undefined : result.error,
    },
  }));
}
