/**
 * Digital Employee — gebonden tool-executors (Sprint 2).
 *
 * Elke executor bindt een BESTAANDE adapter achter de router-gateway —
 * geen nieuwe tool-implementaties. ToolRegistryV2 blijft de enige poort;
 * de router controleert vóór deze laag (allowedTools/registry/policy/
 * approval), daarna voert de bestaande adapter uit.
 *
 * assistant_website_research loopt via de bestaande
 * executeAssistantToolCall (agent-core ExecutionGate + SSRF-guards).
 */

import { randomUUID } from "node:crypto";

import { executeAssistantToolCall } from "../agent-runtime/runtime-adapter.ts";
import type { ToolExecutor } from "./router.ts";

export function createProductionExecutors(): Readonly<Record<string, ToolExecutor>> {
  return {
    assistant_website_research: async (input) => {
      const execution = await executeAssistantToolCall({
        callId: randomUUID(),
        name: "assistant_website_research",
        arguments: JSON.stringify(input ?? {}),
      });
      return {
        ok: execution.ok,
        value: execution.output ?? undefined,
        error: execution.error ?? undefined,
      };
    },
  };
}
