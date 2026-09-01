/**
 * Autonomous AI Employee — orchestrator (TASK FASE 2/5/7/10/11/13).
 *
 * Thin orchestration over EXISTING capabilities. The employee:
 * - starts ONE durable work session per (tenant, sessionKey) — the unique
 *   constraint is the distributed lock (no duplicate morning runs);
 * - works only through explicit tools (tools.ts) with permission checks;
 * - decides deterministically (policy.ts) — no hallucinated decisions,
 *   UNKNOWN evidence blocks automated outreach;
 * - creates outreach drafts only; sending goes through human approval and
 *   the EXISTING email dispatcher (fail-closed, opt-out/rate/warm-up gates);
 * - records every step + decision (evidence trail) and fails controlled.
 */

import { createProspectAnalyzer } from "../prospect-run/openai-analyzer.ts";
import { runProspectAgent } from "../prospect-run/prospect-agent.ts";
import {
  claimProspectRun,
  createProspectRun,
  persistRunManifest,
} from "../prospect-run/repository.ts";
import { dispatchEmail, type EmailProvider } from "../prospect-run/email-dispatcher.ts";
import { buildProspectInput } from "../prospect-run/discovery-pipeline.ts";
import {
  getCompanyByDomain,
  hasFreshResearch,
  upsertCompany,
} from "../prospect-run/discovery-repository.ts";
import {
  decideProspect,
  DEFAULT_INSUFFICIENT_THRESHOLD,
  DEFAULT_QUALIFIED_THRESHOLD,
} from "./policy.ts";
import {
  appendWorkSessionStep,
  createWorkSession,
  getWorkSession,
  updateWorkSessionStatus,
  type EmployeeSql,
} from "./work-session-repository.ts";
import {
  createOutreachDraft,
  discoverProspects,
  qualifyProspect,
  researchCompanyWebsite,
} from "./tools.ts";
import {
  createEmployeeApprovalId,
  type EmployeeApprovalStore,
} from "../approvals/employee-approval.ts";
import type {
  EmployeeToolContext,
  EmployeeWorkSessionConfig,
  EmployeeWorkSessionSummary,
  OutreachActionRecord,
  ProspectDecisionRecord,
  WorkSessionStatus,
} from "./types.ts";
import type { ProspectIntelligence, ProspectInput } from "../prospect-run/types.ts";

export interface EmployeeDeps {
  sql: EmployeeSql;
  fetchImpl?: typeof fetch;
  lookup?: (host: string) => Promise<readonly string[]>;
  analyze?: (input: ProspectInput) => Promise<ProspectIntelligence>;
  provider?: EmailProvider;
  /** TASK 17: approval-store (optioneel; zonder store = huidig gedrag). */
  approvals?: EmployeeApprovalStore;
  now?: () => string;
  log?: (message: string) => void;
}

export interface StartSessionResult {
  sessionId: string;
  status: WorkSessionStatus;
  summary: EmployeeWorkSessionSummary | null;
  /** true when this call started a new run; false when an existing session was returned. */
  started: boolean;
}

function makeContext(deps: EmployeeDeps, tenantId: string): EmployeeToolContext {
  return {
    tenantId,
    sql: deps.sql,
    fetchImpl: deps.fetchImpl,
    lookup: deps.lookup,
    analyze: deps.analyze,
    now: deps.now,
    log: deps.log,
  };
}

function summarize(
  sessionId: string,
  tenantId: string,
  sessionKey: string,
  status: WorkSessionStatus,
  decisions: ProspectDecisionRecord[],
  actions: OutreachActionRecord[],
): EmployeeWorkSessionSummary {
  const waitingApproval = actions.filter((a) => a.status === "PENDING_APPROVAL").length;
  return {
    sessionId,
    tenantId,
    sessionKey,
    status,
    decisions,
    actions,
    qualified: decisions.filter((d) => d.decision === "QUALIFIED" || d.decision === "DRAFT_CREATED").length,
    drafts: actions.length,
    waitingApproval,
    blocked: decisions.filter((d) => d.decision === "BLOCKED").length,
  };
}

/**
 * Start (and run) one employee work session. Idempotent per (tenant, key):
 * an existing PENDING/RUNNING/WAITING_APPROVAL/COMPLETED session is returned
 * unchanged — the morning trigger can never start a duplicate run. A
 * FAILED/CANCELLED session is retried safely by reusing the same row.
 */
export async function startWorkSession(
  config: EmployeeWorkSessionConfig,
  deps: EmployeeDeps,
): Promise<StartSessionResult> {
  const log = deps.log ?? ((message: string) => console.info(`[employee] ${message}`));
  const analyze = deps.analyze ?? createProspectAnalyzer();
  const ctx = makeContext(deps, config.tenantId);
  ctx.analyze = analyze;

  const { session, created } = await createWorkSession(deps.sql, config);
  if (!created) {
    if (session.status === "FAILED" || session.status === "CANCELLED") {
      // Safe retry: reuse the row, reset to PENDING and run again.
      await updateWorkSessionStatus(deps.sql, session.sessionId, "PENDING", null);
      log(`session ${session.sessionKey} retried after ${session.status}`);
    } else {
      log(`session ${session.sessionKey} already ${session.status}; no duplicate run`);
      return { sessionId: session.sessionId, status: session.status, summary: session.summary, started: false };
    }
  }

  const sessionId = session.sessionId;
  const decisions: ProspectDecisionRecord[] = [];
  const actions: OutreachActionRecord[] = [];
  const intelligenceCache = new Map<string, ProspectIntelligence>();

  try {
    await updateWorkSessionStatus(deps.sql, sessionId, "RUNNING", null);
    await appendWorkSessionStep(deps.sql, sessionId, "session_started", "ok", {
      tenantId: config.tenantId,
      sessionKey: config.sessionKey,
    });

    // Tool 1: discovery (validate + dedupe; no external side effect).
    const discovery = await discoverProspects(
      { companies: config.companies, limit: config.limit ?? 5 },
      ctx,
    );
    if (!discovery.ok || !discovery.value) {
      throw new Error(discovery.error ?? "DISCOVERY_FAILED");
    }
    await appendWorkSessionStep(deps.sql, sessionId, "discovery", "ok", {
      companies: discovery.value.companies.length,
      rejected: discovery.value.rejected,
    });

    const freshnessMs = (config.freshnessHours ?? 24) * 3_600_000;
    const qualifiedThreshold = config.qualifiedThreshold ?? DEFAULT_QUALIFIED_THRESHOLD;
    const insufficientThreshold = config.insufficientThreshold ?? DEFAULT_INSUFFICIENT_THRESHOLD;

    for (const company of discovery.value.companies) {
      const domain = company.websiteUrl ? new URL(company.websiteUrl).hostname.replace(/^www\./, "").toLowerCase() : "";
      try {
        let research: Awaited<ReturnType<typeof researchCompanyWebsite>>["value"] | null = null;

        if (domain && (await hasFreshResearch(deps.sql, domain, freshnessMs))) {
          // Cache-first: reuse stored research/detection (cost control).
          const stored = await getCompanyByDomain(deps.sql, domain);
          if (stored?.websiteResearch && stored.aiDetection) {
            research = {
              research: stored.websiteResearch,
              detection: stored.aiDetection,
            };
            await appendWorkSessionStep(deps.sql, sessionId, "research_cached", "ok", { domain });
          }
        }

        if (!research) {
          // Tool 2: guarded website research + deterministic AI detection.
          const toolResult = await researchCompanyWebsite(
            { websiteUrl: company.websiteUrl, domain: domain || company.name },
            ctx,
          );
          if (toolResult.ok && toolResult.value) {
            research = toolResult.value;
            const { companyId } = await upsertCompany(deps.sql, {
              name: company.name,
              domain: domain || company.name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
              industry: company.industry,
              location: company.location,
              discoverySource: `employee:${config.sessionKey}`,
              websiteResearch: research.research,
              aiDetection: research.detection,
            });
            await appendWorkSessionStep(deps.sql, sessionId, "company_stored", "ok", { domain, companyId });
          }
        }

        if (!research) {
          decisions.push({
            domain,
            companyName: company.name,
            decision: "BLOCKED",
            score: null,
            aiStatus: null,
            aiConfidence: null,
            reason: "Website research failed",
            evidence: [],
          });
          await appendWorkSessionStep(deps.sql, sessionId, "company_failed", "error", { domain });
          continue;
        }

        const input = buildProspectInput(
          company,
          research.research.url,
          research.detection,
          research.research.title,
          research.research.text,
        );

        // One analysis per domain per session (no duplicate LLM calls).
        let intelligence = intelligenceCache.get(domain);
        if (!intelligence) {
          intelligence = await analyze(input);
          intelligenceCache.set(domain, intelligence);
        }

        const decision = decideProspect({
          intelligence,
          aiDetection: research.detection,
          qualifiedThreshold,
          insufficientThreshold,
        });

        const record: ProspectDecisionRecord = {
          domain,
          companyName: company.name,
          decision: decision.decision,
          score: decision.score,
          aiStatus: research.detection?.status ?? null,
          aiConfidence: research.detection?.confidence ?? null,
          reason: decision.reason,
          evidence: decision.evidence,
        };

        if (decision.decision === "QUALIFIED" && research.detection) {
          // Tool 3: existing scoring + route (no second engine).
          const qualified = await qualifyProspect({ prospect: input, intelligence }, ctx);
          // Tool 4: existing draft generator (never sends).
          const draft = await createOutreachDraft({ prospect: input, intelligence }, ctx);
          if (!qualified.ok || !qualified.value || !draft.ok || !draft.value) {
            throw new Error(qualified.error ?? draft.error ?? "TOOL_FAILED");
          }
          const actionId = `action_${domain}_${config.sessionKey}`;
          actions.push({
            actionId,
            domain,
            subject: draft.value.subject,
            body: draft.value.body,
            optOutLine: draft.value.optOutLine,
            status: "PENDING_APPROVAL",
          });
          record.decision = "DRAFT_CREATED";
          record.actionId = actionId;

          // Reuse the existing Prospect Run pipeline (idempotent per domain).
          const runId = await createProspectRun(
            deps.sql,
            input,
            "HUMAN_REVIEW",
            config.tenantId,
            `employee:${config.sessionKey}:${domain}`,
          );
          await runProspectAgent(runId, input, "HUMAN_REVIEW", {
            claimRun: (id) => claimProspectRun(deps.sql, id),
            analyze: async () => intelligence,
            persistManifest: (manifest) => persistRunManifest(deps.sql, manifest),
          });
          await appendWorkSessionStep(deps.sql, sessionId, "outreach_draft", "ok", {
            domain,
            actionId,
            runId,
          });
        }

        decisions.push(record);
        await appendWorkSessionStep(deps.sql, sessionId, "decision", "ok", record);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        decisions.push({
          domain,
          companyName: company.name,
          decision: "BLOCKED",
          score: null,
          aiStatus: null,
          aiConfidence: null,
          reason: `Company processing failed: ${message.slice(0, 200)}`,
          evidence: [],
        });
        await appendWorkSessionStep(deps.sql, sessionId, "company_failed", "error", { domain, error: message.slice(0, 300) });
      }
    }

    const pending = actions.filter((a) => a.status === "PENDING_APPROVAL").length;
    const status: WorkSessionStatus = pending > 0 ? "WAITING_APPROVAL" : "COMPLETED";
    const summary = summarize(sessionId, config.tenantId, config.sessionKey, status, decisions, actions);
    await updateWorkSessionStatus(deps.sql, sessionId, status, summary);
    await appendWorkSessionStep(deps.sql, sessionId, "session_completed", "ok", { status });
    log(`session ${config.sessionKey} -> ${status} (${decisions.length} prospects, ${actions.length} drafts)`);
    return { sessionId, status, summary, started: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status: WorkSessionStatus = "FAILED";
    const summary = summarize(sessionId, config.tenantId, config.sessionKey, status, decisions, actions);
    await updateWorkSessionStatus(deps.sql, sessionId, status, summary);
    await appendWorkSessionStep(deps.sql, sessionId, "session_failed", "error", { error: message.slice(0, 300) });
    log(`session ${config.sessionKey} FAILED: ${message.slice(0, 300)}`);
    throw error;
  }
}

export interface ApproveActionInput {
  email: string;
  optedOut?: boolean;
  warmedUp?: boolean;
  rateAllowed?: boolean;
  /** Menselijke identiteit — verplicht wanneer een approval-store is geïnjecteerd (TASK 17). */
  approver?: string;
}

/**
 * Human approval gate. Sending is ONLY reachable through this function, after
 * the session is in WAITING_APPROVAL and the action is PENDING_APPROVAL. The
 * existing email dispatcher then applies its own fail-closed gates
 * (verified email, opt-out, warm-up, rate limit, provider presence).
 *
 * TASK 17: met een approval-store wordt de menselijke beslissing eerst als
 * first-class approval vastgelegd (PENDING → APPROVED); zonder store is het
 * gedrag identiek aan vóór de integratie (backwards compatible).
 */
export async function approveAction(
  sessionId: string,
  actionId: string,
  input: ApproveActionInput,
  deps: EmployeeDeps,
): Promise<{ actionStatus: string; blockedReason?: string; providerMessageId?: string }> {
  const log = deps.log ?? ((message: string) => console.info(`[employee] ${message}`));
  const session = await getWorkSession(deps.sql, sessionId);
  if (!session) throw new Error("WORK_SESSION_NOT_FOUND");
  if (session.status !== "WAITING_APPROVAL") {
    throw new Error(`WORK_SESSION_NOT_APPROVABLE:${session.status}`);
  }
  const summary = session.summary;
  if (!summary) throw new Error("WORK_SESSION_SUMMARY_MISSING");

  const action = summary.actions.find((a) => a.actionId === actionId);
  if (!action) throw new Error("OUTREACH_ACTION_NOT_FOUND");
  if (action.status !== "PENDING_APPROVAL") {
    throw new Error(`OUTREACH_ACTION_NOT_PENDING:${action.status}`);
  }

  // TASK 17: approval als first-class record (idempotente aanmaak + approve).
  if (deps.approvals) {
    if (!input.approver || input.approver.trim().length === 0) {
      throw new Error("APPROVER_REQUIRED");
    }
    const approvalId = createEmployeeApprovalId(sessionId, actionId);
    await deps.approvals.create({
      sessionId,
      actionId,
      requestedBy: "autonomous-employee",
      requestedAction: `email_send:${actionId}`,
      riskLevel: "HIGH",
      now: deps.now?.(),
    });
    await deps.approvals.approve(approvalId, input.approver);
    log(`approval ${approvalId} APPROVED by ${input.approver}`);
  }

  // The existing dispatcher is the second gate (fail-closed).
  const dispatch = await dispatchEmail(
    {
      runId: `employee:${sessionId}:${actionId}`,
      email: input.email,
      draft: { subject: action.subject, body: action.body, optOutLine: action.optOutLine },
      optedOut: input.optedOut ?? false,
      warmedUp: input.warmedUp ?? true,
      rateAllowed: input.rateAllowed ?? true,
      mode: "AUTO_SEND",
    },
    deps.provider,
  );

  if (dispatch.status === "BLOCKED") {
    action.status = "BLOCKED";
    action.blockedReason = dispatch.reason;
    log(`action ${actionId} BLOCKED: ${dispatch.reason}`);
  } else if (dispatch.status === "SENT") {
    action.status = "SENT";
    log(`action ${actionId} SENT (${dispatch.providerMessageId ?? "no id"})`);
  }

  const remaining = summary.actions.filter((a) => a.status === "PENDING_APPROVAL").length;
  const nextStatus: WorkSessionStatus = remaining > 0 ? "WAITING_APPROVAL" : "COMPLETED";
  summary.status = nextStatus;
  await updateWorkSessionStatus(deps.sql, sessionId, nextStatus, summary);
  await appendWorkSessionStep(deps.sql, sessionId, "approval", dispatch.status.toLowerCase(), {
    actionId,
    decision: "approve",
    dispatchStatus: dispatch.status,
    reason: dispatch.reason ?? null,
  });

  return {
    actionStatus: action.status,
    blockedReason: action.blockedReason,
    providerMessageId: dispatch.providerMessageId,
  };
}

/** Human rejection: stops the action; no side effect occurs. */
export async function rejectAction(
  sessionId: string,
  actionId: string,
  deps: EmployeeDeps,
  approver?: string,
): Promise<{ actionStatus: string }> {
  const log = deps.log ?? ((message: string) => console.info(`[employee] ${message}`));
  const session = await getWorkSession(deps.sql, sessionId);
  if (!session) throw new Error("WORK_SESSION_NOT_FOUND");
  const summary = session.summary;
  if (!summary) throw new Error("WORK_SESSION_SUMMARY_MISSING");

  const action = summary.actions.find((a) => a.actionId === actionId);
  if (!action) throw new Error("OUTREACH_ACTION_NOT_FOUND");
  if (action.status !== "PENDING_APPROVAL") {
    throw new Error(`OUTREACH_ACTION_NOT_PENDING:${action.status}`);
  }

  // TASK 17: reject als first-class approval-record.
  if (deps.approvals) {
    if (!approver || approver.trim().length === 0) {
      throw new Error("APPROVER_REQUIRED");
    }
    const approvalId = createEmployeeApprovalId(sessionId, actionId);
    await deps.approvals.create({
      sessionId,
      actionId,
      requestedBy: "autonomous-employee",
      requestedAction: `email_send:${actionId}`,
      riskLevel: "HIGH",
      now: deps.now?.(),
    });
    await deps.approvals.reject(approvalId, approver);
    log(`approval ${approvalId} REJECTED by ${approver}`);
  }

  action.status = "REJECTED";
  const remaining = summary.actions.filter((a) => a.status === "PENDING_APPROVAL").length;
  const nextStatus: WorkSessionStatus = remaining > 0 ? "WAITING_APPROVAL" : "COMPLETED";
  summary.status = nextStatus;
  await updateWorkSessionStatus(deps.sql, sessionId, nextStatus, summary);
  await appendWorkSessionStep(deps.sql, sessionId, "approval", "rejected", { actionId, decision: "reject" });
  log(`action ${actionId} REJECTED`);
  return { actionStatus: "REJECTED" };
}
