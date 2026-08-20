import { detectCommercialIntent } from "./commercial-intent";
import type { CommercialIntentResult } from "./commercial-intent";
import { createLead } from "./persistence/lead-repository";
import { recordLeadEventWithClient } from "./persistence/lead-events";
import type { LeadIntent } from "./lead-types";

export interface OrchestratorMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CustomerZeroInput {
  conversationId: string;
  messages: OrchestratorMessage[];
}

export interface CustomerZeroResult {
  intent: CommercialIntentResult;
  leadCreated: boolean;
  leadId?: string;
}

function mapIntentToLeadIntent(
  intent: CommercialIntentResult,
): LeadIntent {
  switch (intent.level) {
    case "HIGH_COMMERCIAL_INTENT":
      return "appointment";

    case "COMMERCIAL_INTENT":
      return "lead_generation";

    case "BUSINESS_INTEREST":
      return "general_inquiry";

    case "INFORMATIONAL":
    default:
      return "unknown";
  }
}

export async function runCustomerZeroOrchestrator(
  input: CustomerZeroInput,
): Promise<CustomerZeroResult> {
  const intent = detectCommercialIntent(input.messages);

  if (!intent.detected) {
    return {
      intent,
      leadCreated: false,
    };
  }

  const leadIntent = mapIntentToLeadIntent(intent);

  const lead = await createLead({
    conversationId: input.conversationId,
    status:
      intent.level === "HIGH_COMMERCIAL_INTENT"
        ? "QUALIFIED"
        : "NEW",
    source: "ai_assistant",
    intent: leadIntent,
    metadata: {
      commercialIntentLevel: intent.level,
      commercialIntentScore: intent.score,
      commercialIntentReasons: intent.reasons,
    },
  });

  // Append-only events (non-fatal): they record what already happened.
  await recordLeadEventWithClient({
    conversationId: input.conversationId,
    eventType: "assistant_commercial_intent_detected",
    source: "ai_assistant",
    origin: "live_assistant",
    metadata: {
      commercialIntentLevel: intent.level,
      commercialIntentScore: intent.score,
      commercialIntentReasons: intent.reasons,
    },
  });

  if (lead.status === "QUALIFIED") {
    await recordLeadEventWithClient({
      leadId: lead.leadId,
      conversationId: input.conversationId,
      eventType: "lead_qualified",
      source: "ai_assistant",
      origin: "live_assistant",
      metadata: {
        qualifiedBy: "customer_zero_orchestrator",
        commercialIntentLevel: intent.level,
        commercialIntentScore: intent.score,
      },
    });
  }

  return {
    intent,
    leadCreated: true,
    leadId: lead.leadId,
  };
}
