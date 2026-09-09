/**
 * Digital Employee — gebonden tool-executors (Sprint 2, Sprint 4).
 *
 * Elke executor bindt een BESTAANDE adapter achter de router-gateway —
 * geen nieuwe tool-implementaties. ToolRegistryV2 blijft de enige poort;
 * de router controleert vóór deze laag (allowedTools/registry/policy/
 * approval), daarna voert de bestaande adapter uit.
 *
 * assistant_website_research loopt via de bestaande
 * executeAssistantToolCall (agent-core ExecutionGate + SSRF-guards).
 * Sprint 4: elke executor ontvangt de tenant van de live request en geeft
 * die door aan de adapter — runtime-records zijn tenant-correleerbaar.
 */

import { randomUUID } from "node:crypto";

import { executeAssistantToolCall } from "../agent-runtime/runtime-adapter.ts";
import type { ToolExecutor } from "./router.ts";

export interface LiveExecutorOptions {
  /** Verplicht: NO TENANT = NO EXECUTION (runtime-records per tenant). */
  tenantId: string;
  /** DNS resolver voor SSRF pre-flight (tests). */
  lookup?: (host: string) => Promise<readonly string[]>;
  log?: (message: string) => void;
}

export function createProductionExecutors(options: LiveExecutorOptions): Readonly<Record<string, ToolExecutor>> {
  return {
    assistant_website_research: async (input) => {
      const execution = await executeAssistantToolCall(
        {
          callId: randomUUID(),
          name: "assistant_website_research",
          arguments: JSON.stringify(input ?? {}),
        },
        {
          tenantId: options.tenantId,
          lookup: options.lookup,
          log: options.log,
        },
      );
      return {
        ok: execution.ok,
        value: execution.output ?? undefined,
        error: execution.error ?? undefined,
      };
    },
  };
}
