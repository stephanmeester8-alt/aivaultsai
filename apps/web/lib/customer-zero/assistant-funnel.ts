/**
 * Minimal assistant -> customer-zero funnel wiring (TASK 14B).
 *
 * Connects the existing assistant route to the existing customer-zero
 * orchestrator WITHOUT changing any business logic:
 *   assistant -> intent detection -> lead creation -> qualification -> events
 *
 * Safety rules:
 * - a conversation gets at most ONE lead (guard: existing-lead check)
 * - failures are non-fatal (logged, skipped; the assistant reply is untouched)
 * - events are written by the existing non-fatal instrumentation
 */

import type { CustomerZeroInput, CustomerZeroResult } from "./orchestrator";

export interface FunnelDeps {
  /** Whether a lead already exists for this conversation. */
  hasExistingLead: (conversationId: string) => Promise<boolean>;
  /** Runs the existing orchestrator (intent -> createLead -> events). */
  runOrchestrator: (input: CustomerZeroInput) => Promise<CustomerZeroResult>;
}

export interface FunnelOutcome {
  /** Whether the orchestrator was actually invoked. */
  ran: boolean;
  reason: "ran" | "lead_exists" | "failed";
}

export async function maybeRunCustomerZeroOrchestration(
  input: CustomerZeroInput,
  deps: FunnelDeps,
): Promise<FunnelOutcome> {
  try {
    const hasLead = await deps.hasExistingLead(input.conversationId);
    if (hasLead) {
      return { ran: false, reason: "lead_exists" };
    }
    await deps.runOrchestrator(input);
    return { ran: true, reason: "ran" };
  } catch (error) {
    // Funnel wiring must never break the assistant response.
    console.error(
      "[assistant-funnel] customer-zero wiring failed",
      error instanceof Error ? error.name : "unknown",
    );
    return { ran: false, reason: "failed" };
  }
}

/** Production deps using the real DB client and orchestrator (lazy imports). */
export function createDefaultFunnelDeps(): FunnelDeps {
  return {
    hasExistingLead: async (conversationId) => {
      const { sql } = await import("../db/client");
      const rows = await sql`
        SELECT 1
        FROM leads
        WHERE conversation_id = ${conversationId}::uuid
        LIMIT 1
      `;
      return rows.length > 0;
    },
    runOrchestrator: async (input) => {
      const { runCustomerZeroOrchestrator } = await import("./orchestrator");
      return runCustomerZeroOrchestrator(input);
    },
  };
}
