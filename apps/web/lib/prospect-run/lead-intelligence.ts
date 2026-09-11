import { createHash } from "node:crypto";

import type { WebsiteResearchResult } from "./website-research.ts";

export type LeadSignalType =
  | "HIRING_CUSTOMER_SERVICE" | "HIRING_PLANNER" | "HIRING_SALES_SUPPORT"
  | "HIRING_RECRUITER" | "HIGH_MANUAL_INTAKE" | "WHATSAPP_INTAKE"
  | "MULTIPLE_SERVICES" | "APPOINTMENT_FRICTION" | "SUPPORT_FRICTION"
  | "NEW_LOCATION" | "BUSINESS_EXPANSION" | "NEW_SERVICE" | "HIGH_FAQ_LOAD"
  | "URGENT_SERVICE" | "PAID_TRAFFIC" | "NO_CONVERSATIONAL_INTAKE";

export type OpportunityStatus = "REJECTED" | "SIGNAL_QUALIFIED" | "SALES_OPPORTUNITY";

export interface LeadEvidence {
  summary: string;
  sourceUrl: string;
  capturedAt: string;
  sourceHash: string;
}
export interface LeadSignal {
  type: LeadSignalType;
  confidence: number;
  observedAt: string;
  sourceClass: "OFFICIAL_WEBSITE";
  sourceUrl: string;
  verificationStatus: "VERIFIED";
  evidence: LeadEvidence;
}

export interface OpportunityScore {
  icp: number;
  pain: number;
  signal: number;
  automationFit: number;
  evidenceQuality: number;
  opportunity: number;
  scoringVersion: "website-signals-v1";
}

export interface LeadOpportunity {
  status: OpportunityStatus;
  whyNow: string;
  observedPain: string;
  recommendedSolution: string;
  scores: OpportunityScore;
  scoredAt: string;
}

export interface LeadIntelligenceResult {
  signals: LeadSignal[];
  opportunity: LeadOpportunity;
}

export interface LeadIntelligenceExport {
  company: string;
  domain: string;
  location: string | null;
  industry: string | null;
  status: OpportunityStatus;
  whyNow: string;
  signals: LeadSignalType[];
  evidenceUrls: string[];
  observedPain: string;
  recommendedSolution: string;
  opportunityScore: number;
  reviewStatus: "PENDING_HUMAN_REVIEW";
}

interface Rule {
  type: LeadSignalType;
  pattern: RegExp;
  confidence: number;
  pain: string;
  solution: string;
}

const RULES: readonly Rule[] = [
  { type: "WHATSAPP_INTAKE", pattern: /\bwhats\s?app\b/i, confidence: 90, pain: "Customer intake depends on a messaging channel.", solution: "AI-assisted intake and routing with human handoff." },
  { type: "HIGH_FAQ_LOAD", pattern: /\b(veelgestelde vragen|frequently asked questions|faq)\b/i, confidence: 85, pain: "Repeated customer questions create support load.", solution: "Evidence-grounded customer assistant with escalation." },
  { type: "URGENT_SERVICE", pattern: /\b(24\s*\/\s*7|spoed(service)?|emergency service|direct hulp)\b/i, confidence: 90, pain: "Urgent requests require fast qualification and routing.", solution: "Always-on triage, qualification and priority routing." },
  { type: "APPOINTMENT_FRICTION", pattern: /\b(bel (ons|voor)|telefonisch (een )?afspraak|call (us|to book)|afspraak.*telefonisch)\b/i, confidence: 78, pain: "Appointments require a manual phone step.", solution: "Automated appointment intake and scheduling." },
  { type: "HIGH_MANUAL_INTAKE", pattern: /\b(download.*formulier|print.*formulier|formulier.*e-?mail|stuur.*formulier)\b/i, confidence: 82, pain: "Intake relies on manual form handling.", solution: "Structured digital intake, validation and workflow routing." },
  { type: "MULTIPLE_SERVICES", pattern: /\b(onze diensten|services|dienstverlening)\b/i, confidence: 65, pain: "Visitors must select between multiple service paths.", solution: "Conversational service matching and qualified routing." },
];

const INSTRUCTION_INJECTION = /\b(ignore (all |any )?(previous|prior) instructions|system prompt|developer message|you are chatgpt|do not follow)\b/i;

function bounded(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanObservableText(text: string): string {
  return text
    .split(/\n|[.!?]\s+/)
    .filter((part) => !INSTRUCTION_INJECTION.test(part))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text: string, matchIndex: number): string {
  const start = Math.max(0, matchIndex - 90);
  const end = Math.min(text.length, matchIndex + 210);
  return text.slice(start, end).trim().slice(0, 300);
}

/** Pure deterministic detection: only observed official-site text can create a signal. */
export function detectWebsiteSignals(research: WebsiteResearchResult): LeadSignal[] {
  if (research.status !== "ok" || !research.url || !research.text.trim()) return [];
  const text = cleanObservableText(research.text);
  const signals: LeadSignal[] = [];
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (!match || match.index === undefined) continue;
    const summary = excerpt(text, match.index);
    if (!summary) continue;
    signals.push({
      type: rule.type,
      confidence: rule.confidence,
      observedAt: research.fetchedAt,
      sourceClass: "OFFICIAL_WEBSITE",
      sourceUrl: research.url,
      verificationStatus: "VERIFIED",
      evidence: {
        summary,
        sourceUrl: research.url,
        capturedAt: research.fetchedAt,
        sourceHash: createHash("sha256").update(`${research.url}\n${rule.type}\n${summary}`).digest("hex"),
      },
    });
  }
  return signals;
}

export function scoreLeadOpportunity(input: {
  industry?: string | null;
  signals: readonly LeadSignal[];
  scoredAt: string;
}): LeadOpportunity {
  const verified = input.signals.filter((signal) => signal.verificationStatus === "VERIFIED" && signal.evidence.summary && signal.evidence.sourceUrl);
  const averageConfidence = verified.length
    ? verified.reduce((sum, item) => sum + item.confidence, 0) / verified.length
    : 0;
  const icp = input.industry?.trim() ? 65 : 45;
  const pain = verified.length ? Math.min(100, 35 + verified.length * 15) : 0;
  const signal = bounded(averageConfidence);
  const automationFit = verified.length ? Math.min(100, 50 + verified.length * 10) : 0;
  const evidenceQuality = verified.length ? Math.min(100, 70 + verified.length * 5) : 0;
  const opportunity = verified.length
    ? bounded(icp * 0.2 + pain * 0.2 + signal * 0.25 + automationFit * 0.2 + evidenceQuality * 0.15)
    : 0;
  const status: OpportunityStatus = !verified.length
    ? "REJECTED"
    : opportunity >= 75 && automationFit >= 70
      ? "SALES_OPPORTUNITY"
      : "SIGNAL_QUALIFIED";
  const rules = verified.map((signal) => RULES.find((rule) => rule.type === signal.type)!);
  return {
    status,
    whyNow: verified.length ? `Current verified website signal: ${verified.map((item) => item.type).join(", ")}.` : "No current verified website signal.",
    observedPain: rules.map((rule) => rule.pain).join(" "),
    recommendedSolution: rules.map((rule) => rule.solution).join(" "),
    scores: { icp, pain, signal, automationFit, evidenceQuality, opportunity, scoringVersion: "website-signals-v1" },
    scoredAt: input.scoredAt,
  };
}

export function analyzeLeadIntelligence(research: WebsiteResearchResult, industry?: string | null): LeadIntelligenceResult {
  const signals = detectWebsiteSignals(research);
  return { signals, opportunity: scoreLeadOpportunity({ industry, signals, scoredAt: research.fetchedAt }) };
}

export function toLeadIntelligenceExport(input: {
  company: string; domain: string; location?: string | null; industry?: string | null; result: LeadIntelligenceResult;
}): LeadIntelligenceExport {
  return {
    company: input.company,
    domain: input.domain,
    location: input.location ?? null,
    industry: input.industry ?? null,
    status: input.result.opportunity.status,
    whyNow: input.result.opportunity.whyNow,
    signals: input.result.signals.map((signal) => signal.type),
    evidenceUrls: [...new Set(input.result.signals.map((signal) => signal.evidence.sourceUrl))],
    observedPain: input.result.opportunity.observedPain,
    recommendedSolution: input.result.opportunity.recommendedSolution,
    opportunityScore: input.result.opportunity.scores.opportunity,
    reviewStatus: "PENDING_HUMAN_REVIEW",
  };
}
