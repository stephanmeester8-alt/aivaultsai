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
const EMPLOYEE_TOOL_HANDLERS: Readonly<
  Record<string, (input: unknown, ctx: EmployeeToolContext) => Promise<ToolResult<unknown>>>
> = {
  employee_discovery: async (input, ctx) => discoverProspects(input, ctx) as Promise<ToolResult<unknown>>,
  employee_website_research: async (input, ctx) =>
    researchCompanyWebsite(input, ctx) as Promise<ToolResult<unknown>>,
  employee_qualify: async (input, ctx) => qualifyProspect(input, ctx) as Promise<ToolResult<unknown>>,
  // Centrale email_draft-adapter (TASK 18): de employee-ctx.sql is de opslag.
  email_draft: async (input, ctx) => {
    const result = await executeEmailDraft(input, {
      sql: ctx.sql as EmailSql,
      tenantId: ctx.tenantId,
      now: ctx.now,
      log: ctx.log,
    });
    return {
      ok: result.ok,
      value: result.value,
      error: result.error,
      policy: { permission: "EMAIL_DRAFT", allowed: result.ok, reason: result.error },
    } as ToolResult<unknown>;
  },
  // employee_database_read / employee_database_write: adapters volgen in
  // een latere implementatietaak (na de gate).
};

export function executeEmployeeTool(
  toolId: string,
  input: unknown,
  ctx: EmployeeToolContext,
  registry: ToolRegistryV2,
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
    return Promise.resolve({
      ok: false,
      error: "TOOL_DISABLED",
      policy: { toolId, allowed: false, reason: "TOOL_DISABLED" },
    });
  }
  if (registry.resolveAdapter(toolId) === null) {
    return Promise.resolve({
      ok: false,
      error: "NOT_IMPLEMENTED",
      policy: { toolId, allowed: false, reason: "NOT_IMPLEMENTED" },
    });
  }
  const handler = EMPLOYEE_TOOL_HANDLERS[toolId];
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
