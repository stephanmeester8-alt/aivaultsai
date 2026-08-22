import { detectCommercialIntent } from "./commercial-intent.ts";
import type { CommercialIntentResult } from "./commercial-intent.ts";
import { createLead } from "./persistence/lead-repository.ts";
import { recordLeadEventWithClient } from "./persistence/lead-events.ts";
import {
  createQualificationWithClient,
  type QualificationConfidence,
} from "./persistence/qualification-repository.ts";
import type { LeadIntent } from "./lead-types.ts";

export interface OrchestratorMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CustomerZeroInput {
  conversationId: string;
  messages: OrchestratorMessage[];
  /** Optional correlation to the user message that triggered this flow. */
  messageId?: string;
}

export interface CustomerZeroResult {
  intent: CommercialIntentResult;
  leadCreated: boolean;
  leadId?: string;
  /** True when a qualification record was persisted for a QUALIFIED lead. */
  qualificationPersisted?: boolean;
  qualificationId?: string;
}

/**
 * Injectable dependencies (defaults = production). Tests inject fakes to
 * verify event integrity without a database.
 */
export interface OrchestratorDeps {
  createLead: typeof createLead;
  createQualification: typeof createQualificationWithClient;
  recordLeadEvent: typeof recordLeadEventWithClient;
}

export function defaultOrchestratorDeps(): OrchestratorDeps {
  return {
    createLead,
    createQualification: createQualificationWithClient,
    recordLeadEvent: recordLeadEventWithClient,
  };
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

/** Map the intent score (0-10) onto the qualification scale (0-100). */
function qualificationScore(intent: CommercialIntentResult): number {
  return Math.min(100, Math.max(0, intent.score * 10));
}

function qualificationConfidence(intent: CommercialIntentResult): QualificationConfidence {
  return intent.level === "HIGH_COMMERCIAL_INTENT" ? "HIGH" : "MEDIUM";
}

export async function runCustomerZeroOrchestrator(
  input: CustomerZeroInput,
  deps: OrchestratorDeps = defaultOrchestratorDeps(),
): Promise<CustomerZeroResult> {
  const intent = detectCommercialIntent(input.messages);

  if (!intent.detected) {
    return {
      intent,
      leadCreated: false,
    };
  }

  const leadIntent = mapIntentToLeadIntent(intent);

  // createLead records lead_created exactly once and returns its event_id
  // for traceability. No second lead_created event is produced here.
  const lead = await deps.createLead({
    conversationId: input.conversationId,
    messageId: input.messageId,
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

  // Append-only event (non-fatal): records that intent was detected.
  await deps.recordLeadEvent({
    conversationId: input.conversationId,
    messageId: input.messageId,
    eventType: "assistant_commercial_intent_detected",
    source: "ai_assistant",
    origin: "live_assistant",
    metadata: {
      commercialIntentLevel: intent.level,
      commercialIntentScore: intent.score,
      commercialIntentReasons: intent.reasons,
    },
  });

  // The lead_created event (recorded inside createLead) is the originating
  // trace for the qualification record.
  const leadCreatedEventId = lead.leadCreatedEventId;

  if (lead.status !== "QUALIFIED") {
    return {
      intent,
      leadCreated: true,
      leadId: lead.leadId,
      qualificationPersisted: false,
    };
  }

  // Persist the qualification ASSESSMENT (never `status = QUALIFIED` alone).
  // The lead_qualifications table requires at least one supporting event id;
  // without the lead_created event id we cannot produce a compliant record
  // and must not invent one — so the qualification is skipped and logged.
  //
  // Integrity rule: lead_qualified is ONLY recorded when the qualification
  // record actually persisted. A persistence failure yields
  // qualificationPersisted:false and produces NO lead_qualified event.
  let qualificationPersisted = false;
  let qualificationId: string | undefined;
  if (leadCreatedEventId) {
    try {
      const persisted = await deps.createQualification({
        leadId: lead.leadId,
        score: qualificationScore(intent),
        confidence: qualificationConfidence(intent),
        reason:
          intent.reasons.length > 0
            ? intent.reasons.join("; ")
            : `commercial intent level: ${intent.level}`,
        qualifiedBy: "customer_zero_orchestrator",
        supportingEventIds: [leadCreatedEventId],
        metadata: {
          commercialIntentLevel: intent.level,
          commercialIntentScore: intent.score,
        },
      });
      qualificationPersisted = true;
      qualificationId = persisted.qualificationId;
      await deps.recordLeadEvent({
        leadId: lead.leadId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        eventType: "lead_qualified",
        source: "ai_assistant",
        origin: "live_assistant",
        metadata: {
          qualifiedBy: "customer_zero_orchestrator",
          commercialIntentLevel: intent.level,
          commercialIntentScore: intent.score,
          qualificationId,
        },
      });
    } catch (error) {
      console.error(
        "[customer-zero] qualification persistence failed",
        error instanceof Error ? error.name : "unknown",
      );
    }
  } else {
    console.error(
      "[customer-zero] qualification skipped: lead_created event id unavailable",
    );
  }

  return {
    intent,
    leadCreated: true,
    leadId: lead.leadId,
    qualificationPersisted,
    qualificationId,
  };
}
