import assert from "node:assert/strict";
import { test } from "node:test";

import {
  approveAction,
  rejectAction,
  startWorkSession,
} from "../lib/autonomous-employee/orchestrator.ts";
import {
  createWorkSession,
  getWorkSession,
  updateWorkSessionStatus,
  type EmployeeSql,
} from "../lib/autonomous-employee/work-session-repository.ts";
import type { EmployeeWorkSessionConfig } from "../lib/autonomous-employee/types.ts";
import type { EmailProvider } from "../lib/prospect-run/email-dispatcher.ts";
import type { ProspectIntelligence, ProspectInput } from "../lib/prospect-run/types.ts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

const INTERCOM_PAGE = page(
  "Acme BV",
  '<script src="https://widget.intercom.io/widget/abc"></script><p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat.</p>',
);
const PLAIN_PAGE = page(
  "Beta BV",
  "<p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat. Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat. Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat.</p>",
);
const TINY_PAGE = "<html><body>Hi</body></html>";

interface FakeState {
  sessions: Map<string, Record<string, unknown>>;
  steps: Array<Record<string, unknown>>;
  companySeq: number;
  runSeq: number;
}

function makeEmployeeSql(options: { failFirstStepInsert?: boolean } = {}) {
  const state: FakeState = { sessions: new Map(), steps: [], companySeq: 0, runSeq: 0 };
  let stepFailArmed = options.failFirstStepInsert ?? false;

  const sql: EmployeeSql = async (strings, ...values) => {
    const text = strings.join("?");
    if (text.includes("INSERT INTO employee_work_session_steps")) {
      if (stepFailArmed) {
        stepFailArmed = false;
        throw new Error("step insert failed (simulated)");
      }
      state.steps.push({ session_id: values[0], step: values[1], status: values[2], detail: values[3] });
      return [];
    }
    if (text.includes("INSERT INTO employee_work_sessions")) {
      const key = `${String(values[0])}:${String(values[1])}`;
      if (state.sessions.has(key)) return [];
      const rec: Record<string, unknown> = {
        session_id: `sess-${state.sessions.size + 1}`,
        tenant_id: values[0],
        session_key: values[1],
        status: "PENDING",
        config: JSON.parse(String(values[2])),
        summary: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      };
      state.sessions.set(key, rec);
      return [rec];
    }
    if (text.includes("FROM employee_work_sessions")) {
      if (text.includes("WHERE tenant_id =")) {
        const rows = [...state.sessions.values()].filter(
          (s) => s.tenant_id === values[0] && s.session_key === values[1],
        );
        return rows;
      }
      const rows = [...state.sessions.values()].filter((s) => s.session_id === values[0]);
      return rows;
    }
    if (text.includes("UPDATE employee_work_sessions")) {
      const rec = [...state.sessions.values()].find((s) => s.session_id === values[3]);
      if (rec) {
        rec.status = values[0];
        if (values[1] != null) rec.summary = JSON.parse(String(values[1]));
      }
      return [];
    }
    if (text.includes("SELECT 1\n    FROM companies")) return [];
    if (text.includes("INSERT INTO companies")) {
      state.companySeq += 1;
      return [{ company_id: `c-${state.companySeq}` }];
    }
    if (text.includes("UPDATE companies")) return [];
    if (text.includes("SELECT\n      company_id, name, domain")) return [];
    if (text.includes("INSERT INTO prospect_runs")) {
      state.runSeq += 1;
      return [{ run_id: `run-${state.runSeq}` }];
    }
    if (text.includes("UPDATE prospect_runs")) return [{ run_id: "claimed" }];
    if (text.includes("INSERT INTO audit_manifests")) return [];
    return [];
  };
  return { sql, state };
}

function intelligenceFor(companyName: string): ProspectIntelligence {
  if (companyName.includes("Acme")) {
    return {
      pains: ["manual qualification"],
      evidence: ["intercom detected", "pricing page"],
      unknowns: [],
      commercialOpportunity: 90,
      evidenceBaseline: 80,
      uncertainty: 10,
    };
  }
  if (companyName.includes("Beta")) {
    return {
      pains: ["websitevragen"],
      evidence: ["pricing page"],
      unknowns: ["CRM"],
      commercialOpportunity: 40,
      evidenceBaseline: 30,
      uncertainty: 20,
    };
  }
  return {
    pains: [],
    evidence: ["pricing page"],
    unknowns: ["CRM", "conversie"],
    commercialOpportunity: 90,
    evidenceBaseline: 80,
    uncertainty: 10,
  };
}

function employeeDeps(sql: EmployeeSql, opts: { provider?: EmailProvider } = {}) {
  return {
    sql,
    fetchImpl: async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("acme")) return new Response(INTERCOM_PAGE, { status: 200 });
      if (u.includes("beta")) return new Response(PLAIN_PAGE, { status: 200 });
      return new Response(TINY_PAGE, { status: 200 });
    },
    lookup: async () => ["93.184.216.34"],
    analyze: async (input: ProspectInput) => intelligenceFor(input.companyName),
    now: () => "2026-09-01T00:00:00.000Z",
    log: () => {},
    ...(opts.provider ? { provider: opts.provider } : {}),
  };
}

function baseConfig(overrides: Partial<EmployeeWorkSessionConfig> = {}): EmployeeWorkSessionConfig {
  return {
    tenantId: TENANT_A,
    sessionKey: "2026-09-01",
    companies: [
      { name: "Acme BV", websiteUrl: "https://acme.nl", industry: "SaaS" },
      { name: "Beta BV", websiteUrl: "https://beta.nl" },
      { name: "Gamma BV", websiteUrl: "https://gamma.nl" },
    ],
    limit: 5,
    ...overrides,
  };
}

test("employee starts and runs a full work session (discovery -> research -> detection -> scoring -> drafts -> WAITING_APPROVAL)", async () => {
  const { sql, state } = makeEmployeeSql();
  const result = await startWorkSession(baseConfig(), employeeDeps(sql));

  assert.equal(result.started, true);
  assert.equal(result.status, "WAITING_APPROVAL");
  assert.ok(result.summary);

  const decisions = result.summary!.decisions;
  assert.equal(decisions.length, 3);

  const acme = decisions.find((d) => d.domain === "acme.nl")!;
  assert.equal(acme.decision, "DRAFT_CREATED");
  assert.equal(acme.aiStatus, "yes");
  assert.equal(acme.score!.total, 84);
  assert.ok(acme.actionId);

  const beta = decisions.find((d) => d.domain === "beta.nl")!;
  assert.equal(beta.decision, "INSUFFICIENT_EVIDENCE");
  assert.equal(beta.aiStatus, "no");

  const gamma = decisions.find((d) => d.domain === "gamma.nl")!;
  assert.equal(gamma.decision, "INSUFFICIENT_EVIDENCE");
  assert.equal(gamma.aiStatus, "unknown");

  assert.equal(result.summary!.qualified, 1);
  assert.equal(result.summary!.drafts, 1);
  assert.equal(result.summary!.waitingApproval, 1);

  const action = result.summary!.actions[0]!;
  assert.equal(action.status, "PENDING_APPROVAL");
  assert.match(action.subject, /Acme/);
  assert.match(action.body, /Acme/);

  // Every decision is traceable (evidence trail + persisted steps).
  assert.ok(acme.evidence.length > 0);
  assert.ok(acme.reason.length > 0);
  assert.ok(state.steps.some((s) => s.step === "decision" && s.status === "ok"));
  assert.ok(state.steps.some((s) => s.step === "session_completed"));
});

test("human approval allows execution through the existing dispatcher", async () => {
  let sent = 0;
  const provider: EmailProvider = {
    send: async () => {
      sent += 1;
      return { providerMessageId: "p-1" };
    },
  };
  const { sql } = makeEmployeeSql();
  const result = await startWorkSession(baseConfig(), employeeDeps(sql, { provider }));
  const actionId = result.summary!.actions[0]!.actionId;

  const approval = await approveAction(
    result.sessionId,
    actionId,
    { email: "owner@acme.nl" },
    employeeDeps(sql, { provider }),
  );
  assert.equal(approval.actionStatus, "SENT");
  assert.equal(approval.providerMessageId, "p-1");
  assert.equal(sent, 1);

  // Session completes once no action is pending.
  const stored = await getWorkSession(sql, result.sessionId);
  assert.equal(stored!.status, "COMPLETED");
});

test("rejection stops execution and never touches the provider", async () => {
  let sent = 0;
  const provider: EmailProvider = {
    send: async () => {
      sent += 1;
      return { providerMessageId: "p-1" };
    },
  };
  const { sql } = makeEmployeeSql();
  const result = await startWorkSession(baseConfig(), employeeDeps(sql, { provider }));
  const actionId = result.summary!.actions[0]!.actionId;

  const rejection = await rejectAction(result.sessionId, actionId, employeeDeps(sql));
  assert.equal(rejection.actionStatus, "REJECTED");
  assert.equal(sent, 0);
});

test("opt-out blocks email at the dispatcher gate", async () => {
  let sent = 0;
  const provider: EmailProvider = {
    send: async () => {
      sent += 1;
      return { providerMessageId: "p-1" };
    },
  };
  const { sql } = makeEmployeeSql();
  const result = await startWorkSession(baseConfig(), employeeDeps(sql, { provider }));
  const actionId = result.summary!.actions[0]!.actionId;

  const approval = await approveAction(
    result.sessionId,
    actionId,
    { email: "owner@acme.nl", optedOut: true },
    employeeDeps(sql, { provider }),
  );
  assert.equal(approval.actionStatus, "BLOCKED");
  assert.equal(approval.blockedReason, "RECIPIENT_OPTED_OUT");
  assert.equal(sent, 0);
});

test("rate limit and warm-up blocks are enforced at dispatch", async () => {
  const provider: EmailProvider = { send: async () => ({ providerMessageId: "p-1" }) };
  const { sql } = makeEmployeeSql();
  const result = await startWorkSession(baseConfig(), employeeDeps(sql, { provider }));
  const actionId = result.summary!.actions[0]!.actionId;

  const rateBlocked = await approveAction(
    result.sessionId,
    actionId,
    { email: "owner@acme.nl", rateAllowed: false },
    employeeDeps(sql, { provider }),
  );
  assert.equal(rateBlocked.blockedReason, "RATE_LIMITED");
});

test("sending without a configured provider is blocked (fail-closed)", async () => {
  const { sql } = makeEmployeeSql();
  const result = await startWorkSession(baseConfig(), employeeDeps(sql));
  const actionId = result.summary!.actions[0]!.actionId;
  const approval = await approveAction(
    result.sessionId,
    actionId,
    { email: "owner@acme.nl" },
    employeeDeps(sql),
  );
  assert.equal(approval.actionStatus, "BLOCKED");
  assert.equal(approval.blockedReason, "EMAIL_PROVIDER_NOT_CONFIGURED");
});

test("approval is required: actions cannot be approved outside WAITING_APPROVAL", async () => {
  const { sql } = makeEmployeeSql();
  const config = baseConfig({ companies: [{ name: "Beta BV", websiteUrl: "https://beta.nl" }] });
  const result = await startWorkSession(config, employeeDeps(sql));
  // Beta is insufficient -> no drafts -> session COMPLETED without actions.
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.summary!.actions.length, 0);
});

test("UNKNOWN evidence blocks automated outreach end-to-end", async () => {
  const { sql } = makeEmployeeSql();
  const result = await startWorkSession(
    baseConfig({ companies: [{ name: "Gamma BV", websiteUrl: "https://gamma.nl" }] }),
    employeeDeps(sql),
  );
  const gamma = result.summary!.decisions[0]!;
  assert.equal(gamma.decision, "INSUFFICIENT_EVIDENCE");
  assert.equal(gamma.aiStatus, "unknown");
  assert.equal(result.summary!.actions.length, 0);
});

test("duplicate run is prevented: same tenant+key returns the existing session", async () => {
  const { sql } = makeEmployeeSql();
  const first = await startWorkSession(baseConfig(), employeeDeps(sql));
  const second = await startWorkSession(baseConfig(), employeeDeps(sql));
  assert.equal(second.started, false);
  assert.equal(second.sessionId, first.sessionId);
  assert.equal(second.status, "WAITING_APPROVAL");
});

test("duplicate prospects are prevented (dedupe + stable idempotency keys)", async () => {
  const { sql, state } = makeEmployeeSql();
  const result = await startWorkSession(
    baseConfig({
      companies: [
        { name: "Acme BV", websiteUrl: "https://www.acme.nl" },
        { name: "Acme BV herhaald", websiteUrl: "https://acme.nl" },
        { name: "Acme BV nogmaals", websiteUrl: "https://acme.nl" },
      ],
    }),
    employeeDeps(sql),
  );
  assert.equal(result.summary!.decisions.length, 1);
  assert.equal(state.runSeq, 1); // one prospect run for the deduped domain
});

test("failed run is persisted as FAILED and retry is safe", async () => {
  const { sql, state } = makeEmployeeSql({ failFirstStepInsert: true });
  await assert.rejects(() => startWorkSession(baseConfig(), employeeDeps(sql)));

  const stored = [...state.sessions.values()][0]!;
  assert.equal(stored.status, "FAILED");
  assert.ok(state.steps.some((s) => s.step === "session_failed" && s.status === "error"));

  // Retry: the FAILED session is reset and a new run succeeds.
  const retry = await startWorkSession(baseConfig(), employeeDeps(sql));
  assert.equal(retry.started, true);
  assert.equal(retry.status, "WAITING_APPROVAL");
  const after = [...state.sessions.values()][0]!;
  assert.equal(after.status, "WAITING_APPROVAL");
});

test("work session can resume: an existing RUNNING session is returned", async () => {
  const { sql } = makeEmployeeSql();
  const config = baseConfig();
  const created = await createWorkSession(sql, config);
  await updateWorkSessionStatus(sql, created.session.sessionId, "RUNNING", null);

  const result = await startWorkSession(config, employeeDeps(sql));
  assert.equal(result.started, false);
  assert.equal(result.sessionId, created.session.sessionId);
  assert.equal(result.status, "RUNNING");
});

test("tenant isolation: separate sessions per tenant, no cross-tenant data", async () => {
  const { sql, state } = makeEmployeeSql();
  const a = await startWorkSession(baseConfig({ tenantId: TENANT_A }), employeeDeps(sql));
  const b = await startWorkSession(
    baseConfig({ tenantId: TENANT_B, companies: [{ name: "Beta BV", websiteUrl: "https://beta.nl" }] }),
    employeeDeps(sql),
  );
  assert.notEqual(a.sessionId, b.sessionId);
  assert.equal(a.summary!.tenantId, TENANT_A);
  assert.equal(b.summary!.tenantId, TENANT_B);
  assert.equal(b.status, "COMPLETED");

  // Approving tenant A's action cannot touch tenant B's session.
  const actionId = a.summary!.actions[0]!.actionId;
  const approval = await approveAction(a.sessionId, actionId, { email: "owner@acme.nl" }, employeeDeps(sql));
  assert.ok(["SENT", "BLOCKED"].includes(approval.actionStatus));
  const bAfter = [...state.sessions.values()].find((s) => s.session_id === b.sessionId)!;
  assert.equal(bAfter.status, "COMPLETED");
});
