/**
 * Autonomous AI Employee — shared types (TASK: Make the Autonomous AI
 * Employee work).
 *
 * The employee is a thin, deterministic orchestration layer over the EXISTING
 * Prospect Run (discovery, research, detection, scoring, policy, dispatcher).
 * Sessions are persisted so a crashed run can be inspected, resumed or
 * retried safely. All decisions are recorded per prospect (evidence trail).
 */

import type { DiscoveredCompany } from "../prospect-run/discovery.ts";
import type { AiDetectionResult } from "../prospect-run/ai-detection.ts";
import type { PropensityScore, SalesRoute } from "../prospect-run/types.ts";

export type WorkSessionStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type EmployeeDecision =
  | "NOT_QUALIFIED"
  | "INSUFFICIENT_EVIDENCE"
  | "QUALIFIED"
  | "DRAFT_CREATED"
  | "APPROVAL_REQUIRED"
  | "BLOCKED";

export interface EmployeeWorkSessionConfig {
  tenantId: string;
  /** Stable per-tenant key; "YYYY-MM-DD" for the daily morning run. */
  sessionKey: string;
  companies: readonly DiscoveredCompany[];
  limit?: number;
  freshnessHours?: number;
  /** Score at/above which a prospect is considered qualified. */
  qualifiedThreshold?: number;
  /** Score at/above which a prospect is interesting but under-evidenced. */
  insufficientThreshold?: number;
}

export interface ProspectDecisionRecord {
  domain: string;
  companyName: string;
  decision: EmployeeDecision;
  score: PropensityScore | null;
  aiStatus: AiDetectionResult["status"] | null;
  aiConfidence: number | null;
  reason: string;
  evidence: string[];
  actionId?: string;
}

export interface OutreachActionRecord {
  actionId: string;
  domain: string;
  subject: string;
  body: string;
  optOutLine: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SENT" | "BLOCKED";
  blockedReason?: string;
}

export interface EmployeeWorkSessionSummary {
  sessionId: string;
  tenantId: string;
  sessionKey: string;
  status: WorkSessionStatus;
  decisions: ProspectDecisionRecord[];
  actions: OutreachActionRecord[];
  qualified: number;
  drafts: number;
  waitingApproval: number;
  blocked: number;
}

export interface EmployeeToolContext {
  tenantId: string;
  sql: import("./work-session-repository.ts").EmployeeSql;
  fetchImpl?: typeof fetch;
  lookup?: (host: string) => Promise<readonly string[]>;
  analyze?: (input: import("../prospect-run/types.ts").ProspectInput) => Promise<import("../prospect-run/types.ts").ProspectIntelligence>;
  now?: () => string;
  log?: (message: string) => void;
  /** TASK 24: observability-only recorder (optioneel; no-op zonder). */
  recorder?: import("../observability/metrics.ts").MetricRecorder;
}

export interface EmployeeWorkSessionRecord {
  sessionId: string;
  tenantId: string;
  sessionKey: string;
  status: WorkSessionStatus;
  config: EmployeeWorkSessionConfig;
  summary: EmployeeWorkSessionSummary | null;
  createdAt: string;
  updatedAt: string;
}

export type { SalesRoute };
