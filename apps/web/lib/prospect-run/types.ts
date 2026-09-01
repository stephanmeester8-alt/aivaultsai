export type ProspectRunState =
  | "INTAKE"
  | "ANALYZING"
  | "QUALIFIED"
  | "ROUTED"
  | "DRAFTED"
  | "AWAITING_REVIEW"
  | "QUEUED"
  | "SENT"
  | "BLOCKED"
  | "FAILED";

export type SalesRoute = "SOVEREIGN_LOCAL_AI" | "BYOK_COST_REDUCTION" | "HITL_COMPLIANCE";
export type DispatchMode = "HUMAN_REVIEW" | "AUTO_SEND";

export interface ProspectInput {
  companyName: string;
  websiteUrl: string;
  decisionMakerName?: string;
  decisionMakerRole?: string;
  /** Must be collected from a lawful, verified source before it can be used. */
  verifiedBusinessEmail?: string;
  industry?: string;
  employeeCount?: number;
  publicSignals?: string[];
  crmSignals?: string[];
  knownPainPoints?: string[];
  roiMetrics?: Record<string, number>;
}

export interface ProspectIntelligence {
  pains: string[];
  evidence: string[];
  unknowns: string[];
  commercialOpportunity: number;
  evidenceBaseline: number;
  uncertainty: number;
}

export interface PropensityScore {
  total: number;
  commercialOpportunity: number;
  evidenceBaseline: number;
  uncertaintyPenalty: number;
  rationale: string;
}

export interface OutreachDraft {
  subject: string;
  body: string;
  optOutLine: string;
}

export interface ProspectRunResult {
  runId: string;
  state: ProspectRunState;
  score?: PropensityScore;
  route?: SalesRoute;
  draft?: OutreachDraft;
  blockedReason?: string;
}

export interface RunManifest {
  runId: string;
  createdAt: string;
  state: ProspectRunState;
  inputs: Record<string, unknown>;
  evidence: string[];
  score?: PropensityScore;
  route?: SalesRoute;
  dispatchMode: DispatchMode;
  policyDecisions: string[];
}
