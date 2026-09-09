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
import { fireFunnelAnalytics } from "../analytics/gtag.ts";

export interface FunnelDeps {
  /** Whether a lead already exists for this conversation (tenant-aware). */
  hasExistingLead: (conversationId: string, tenantId: string) => Promise<boolean>;
  /** Runs the existing orchestrator (intent -> createLead -> events). */
  runOrchestrator: (input: CustomerZeroInput) => Promise<CustomerZeroResult>;
  /**
   * Optional post-lead agent runtime step (Customer-Zero -> Agent Runtime).
   * Runs only when the orchestrator created a lead; idempotent per
   * conversation; non-fatal. Tenant-aware (Sprint 4): runtime-records en de
   * claim zijn per (tenantId, conversationId).
   */
  runRuntimeTask?: (conversationId: string, tenantId: string) => Promise<unknown>;
  /**
   * Optional internal notification when a conversation becomes a lead.
   * Runs only on lead creation (max once per conversation), never on
   * informational chats; non-fatal. Receives a concise server-generated
   * summary — never the raw conversation.
   */
  notifyLead?: (summary: LeadCreatedSummary) => Promise<void>;
}

/** Korte, server-gegenereerde samenvatting van een nieuwe assistant-lead. */
export interface LeadCreatedSummary {
  /** Verplicht: NO TENANT = NO EXECUTION (Sprint 3). */
  tenantId: string;
  conversationId: string;
  leadId?: string;
  intentLevel: string;
  intentScore: number;
  /** Naam/e-mail worden alleen meegestuurd als de lead die werkelijk heeft. */
  name?: string | null;
  email?: string | null;
  createdAt?: string;
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
    const hasLead = await deps.hasExistingLead(input.conversationId, input.tenantId);
    if (hasLead) {
      return { ran: false, reason: "lead_exists" };
    }
    const result = await deps.runOrchestrator(input);
    // Customer-Zero -> Agent Runtime: one safe, idempotent runtime task per
    // lead conversation. Never affects the assistant reply.
    if (result.leadCreated) {
      try {
        await deps.runRuntimeTask?.(input.conversationId, input.tenantId);
      } catch (error) {
        console.error(
          "[assistant-funnel] agent runtime task failed",
          error instanceof Error ? error.name : "unknown",
        );
      }
      // Interne notificatie (Resend) bij lead-creatie — non-fatal; de lead
      // staat al in de database en blijft daar bij een notificatiefout.
      if (deps.notifyLead) {
        try {
          await deps.notifyLead({
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            leadId: result.leadId,
            intentLevel: result.intent.level,
            intentScore: result.intent.score,
          });
        } catch (error) {
          console.error(
            "[assistant-funnel] lead notification failed",
            error instanceof Error ? error.name : "unknown",
          );
        }
      }
    }
    // GA4 observability only — never decides anything; non-fatal.
    await fireFunnelAnalytics(input.conversationId, result);
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
    hasExistingLead: async (conversationId, tenantId) => {
      const { sql } = await import("../db/client");
      const rows = await sql`
        SELECT 1
        FROM leads
        WHERE conversation_id = ${conversationId}::uuid
          AND tenant_id = ${tenantId}::uuid
        LIMIT 1
      `;
      return rows.length > 0;
    },
    runOrchestrator: async (input) => {
      const { runCustomerZeroOrchestrator } = await import("./orchestrator");
      return runCustomerZeroOrchestrator(input);
    },
    runRuntimeTask: async (conversationId, tenantId) => {
      const { runConversationRuntimeTask } = await import(
        "../agent-runtime/runtime-adapter"
      );
      return runConversationRuntimeTask(conversationId, tenantId);
    },
    notifyLead: async (summary) => {
      // Lead-data server-side ophalen (nooit LLM-output vertrouwen) en de
      // interne notificatie via de bestaande Resend-kernel versturen naar
      // LEAD_NOTIFICATION_EMAIL (server-env; geen hardcoded adres).
      // Tenant-filter: een lead uit een andere tenant is voor deze tenant
      // niet zichtbaar (Sprint 3).
      const { sql } = await import("../db/client");
      const rows = await sql`
        SELECT name, email, phone, company, intent, status, created_at
        FROM leads
        WHERE lead_id = ${summary.leadId ?? null}::uuid
          AND tenant_id = ${summary.tenantId}::uuid
        LIMIT 1
      ` as unknown as Array<{
        name?: unknown; email?: unknown; phone?: unknown; company?: unknown;
        intent?: unknown; status?: unknown; created_at?: unknown;
      }>;
      const lead = rows[0];

      const apiKey = process.env.RESEND_API_KEY;
      const from = process.env.LEAD_FROM_EMAIL;
      const to = process.env.LEAD_NOTIFICATION_EMAIL;
      if (!apiKey || !from || !to) {
        console.warn("[assistant-funnel] Resend niet geconfigureerd — lead-notificatie overgeslagen");
        return;
      }

      const { createResendSender } = await import("../leads/notify");
      const send = createResendSender({ apiKey, from, to });
      const name = typeof lead?.name === "string" && lead.name.length > 0 ? lead.name : null;
      const email = typeof lead?.email === "string" && lead.email.length > 0 ? lead.email : null;
      const phone = typeof lead?.phone === "string" && lead.phone.length > 0 ? lead.phone : null;
      const company = typeof lead?.company === "string" && lead.company.length > 0 ? lead.company : null;
      const status = typeof lead?.status === "string" ? lead.status : "NEW";
      const createdAt = typeof lead?.created_at === "string" ? lead.created_at : "";

      const lines = [
        "Nieuwe lead via de AI-assistent op de website.",
        "",
        `Conversatie: ${summary.conversationId}`,
        `Lead ID: ${summary.leadId ?? "-"}`,
        `Intent: ${summary.intentLevel} (score ${summary.intentScore}/10)`,
        `Status: ${status}`,
        `Naam: ${name ?? "-"}`,
        `E-mail: ${email ?? "-"}`,
        `Telefoon: ${phone ?? "-"}`,
        `Bedrijf: ${company ?? "-"}`,
        `Aangemaakt: ${createdAt}`,
      ];
      await send({
        subject: "Nieuwe lead via AIVaultsAI — AI-assistent",
        text: lines.join("\n"),
      });
    },
  };
}
