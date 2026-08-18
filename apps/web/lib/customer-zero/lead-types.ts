export type LeadStatus =
  | "NEW"
  | "QUALIFIED"
  | "FOLLOW_UP"
  | "CONVERTED"
  | "DISQUALIFIED";

export type LeadSource =
  | "website"
  | "ai_assistant"
  | "linkedin"
  | "instagram"
  | "organic_search"
  | "direct"
  | "referral"
  | "other";

export type LeadIntent =
  | "website"
  | "ai_assistant"
  | "lead_generation"
  | "automation"
  | "appointment"
  | "general_inquiry"
  | "unknown";

export type LeadEventType =
  | "assistant_conversation_started"
  | "assistant_commercial_intent_detected"
  | "contact_information_provided"
  | "contact_request_submitted"
  | "appointment_request_submitted"
  | "lead_created"
  | "lead_qualified"
  | "follow_up_requested";

export type LeadEventOrigin =
  | "live_assistant"
  | "contact_form"
  | "appointment_flow"
  | "manual"
  | "system";

export type QualificationConfidence = "LOW" | "MEDIUM" | "HIGH";

export interface LeadContact {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
}

export interface Lead {
  leadId: string;
  createdAt: string;
  status: LeadStatus;
  source: LeadSource;
  intent: LeadIntent;
  contact?: LeadContact;
}

export interface LeadEvent {
  eventId: string;
  occurredAt: string;
  eventType: LeadEventType;
  source: LeadSource;
  origin: LeadEventOrigin;
}

export interface LeadQualification {
  leadId: string;
  score: number;
  confidence: QualificationConfidence;
  reason: string;
  qualifiedAt: string;
  qualifiedBy: string;
  supportingEventIds: string[];
}
