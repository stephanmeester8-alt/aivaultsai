import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createEmployeeApprovalId,
  createInMemoryEmployeeApprovalStore,
  storeToApprovalGate,
} from "../lib/approvals/employee-approval.ts";
import { approveAction, rejectAction, startWorkSession } from "../lib/autonomous-employee/orchestrator.ts";
import type { EmployeeSql } from "../lib/autonomous-employee/work-session-repository.ts";
import type { EmployeeWorkSessionConfig, EmployeeWorkSessionSummary } from "../lib/autonomous-employee/types.ts";
import type { EmailProvider } from "../lib/prospect-run/email-dispatcher.ts";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

test("employee-approval: idempotente create + approve/reject/get", async () => {
  const store = createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z");
  const approvalId = createEmployeeApprovalId("sess-1", "action_1");
  const created = await store.create({
    sessionId: "sess-1",
    actionId: "action_1",
    requestedBy: "autonomous-employee",
    requestedAction: "email_send:action_1",
    riskLevel: "HIGH",
  });
  assert.equal(created.status, "PENDING");
  assert.equal(created.approvalId, approvalId);

  // Idempotent: tweede create retourneert dezelfde record.
  const again = await store.create({
    sessionId: "sess-1",
    actionId: "action_1",
    requestedBy: "autonomous-employee",
    requestedAction: "email_send:action_1",
    riskLevel: "HIGH",
  });
  assert.equal(again.approvalId, approvalId);

  const approved = await store.approve(approvalId, "human@owner.nl");
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approvedBy, "human@owner.nl");
  assert.ok(approved.resolvedAt);

  const fetched = await store.get(approvalId);
  assert.equal(fetched?.status, "APPROVED");
  assert.equal(await store.get("apr_onbekend"), null);
});

test("employee-approval: self-approval / ongeldige approver → geweigerd", async () => {
  const store = createInMemoryEmployeeApprovalStore();
  const approvalId = createEmployeeApprovalId("sess-1", "action_2");
  await store.create({
    sessionId: "sess-1",
    actionId: "action_2",
    requestedBy: "autonomous-employee",
    requestedAction: "email_send:action_2",
    riskLevel: "HIGH",
  });
  await assert.rejects(store.approve(approvalId, "autonomous-employee"), /SELF_APPROVAL/);
  await assert.rejects(store.approve(approvalId, "  "), /INVALID_APPROVER/);
  await assert.rejects(store.approve("apr_onbekend", "human@owner.nl"), /APPROVAL_NOT_FOUND/);
});

test("employee-approval: PENDING-only transitions (geen tweede beslissing)", async () => {
  const store = createInMemoryEmployeeApprovalStore();
  const approvalId = createEmployeeApprovalId("sess-1", "action_3");
  await store.create({
    sessionId: "sess-1",
    actionId: "action_3",
    requestedBy: "autonomous-employee",
    requestedAction: "email_send:action_3",
    riskLevel: "HIGH",
  });
  await store.reject(approvalId, "human@owner.nl");
  await assert.rejects(store.approve(approvalId, "ander@owner.nl"), /APPROVAL_ALREADY_RESOLVED/);
  await assert.rejects(store.reject(approvalId, "ander@owner.nl"), /APPROVAL_ALREADY_RESOLVED/);
});

test("storeToApprovalGate: APPROVED + binding → allowed; rest → DENY", async () => {
  const store = createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z");
  await store.create({
    sessionId: "sess-1",
    actionId: "action_4",
    requestedBy: "autonomous-employee",
    requestedAction: "email_send:action_4",
    riskLevel: "HIGH",
  });
  const gate = storeToApprovalGate(store);
  const approvalId = createEmployeeApprovalId("sess-1", "action_4");

  // PENDING → denied
  assert.equal((await gate.check({ approvalId, requestedAction: "email_send:action_4" })).allowed, false);

  await store.approve(approvalId, "human@owner.nl");
  assert.deepEqual(await gate.check({ approvalId, requestedAction: "email_send:action_4" }), { allowed: true });
  // Binding mismatch
  assert.equal(
    (await gate.check({ approvalId, requestedAction: "email_send:andere" })).reason,
    "APPROVAL_BINDING_MISMATCH",
  );
  // Onbekend
  assert.equal((await gate.check({ approvalId: "apr_x", requestedAction: "a" })).reason, "APPROVAL_NOT_FOUND");
});

test("storeToApprovalGate: TTL verstreken → EXPIRED", async () => {
  const store = createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z");
  await store.create({
    sessionId: "sess-1",
    actionId: "action_5",
    requestedBy: "autonomous-employee",
    requestedAction: "email_send:action_5",
    riskLevel: "HIGH",
    expiresAt: "2026-09-01T07:00:00.000Z", // vóór now()
  });
  const gate = storeToApprovalGate(store);
  const approvalId = createEmployeeApprovalId("sess-1", "action_5");
  await store.approve(approvalId, "human@owner.nl");
  const check = await gate.check({ approvalId, requestedAction: "email_send:action_5" });
  assert.equal(check.allowed, false);
  if (!check.allowed) assert.equal(check.reason, "APPROVAL_EXPIRED");
});

// ---- Orchestrator-integratie (TASK 17) ----

interface SessionRow {
  session_id: string;
  tenant_id: string;
  session_key: string;
  status: string;
  config: unknown;
  summary: unknown;
  created_at: string;
  updated_at: string;
}

function makeSessionSql() {
  const sessions = new Map<string, SessionRow>();
  let seq = 0;
  const sql: EmployeeSql = async (strings, ...values) => {
    const query = strings.join("?");
    if (query.includes("INSERT INTO employee_work_sessions")) {
      const [tenantId, sessionKey, configJson] = values as [string, string, string];
      const existing = [...sessions.values()].find(
        (row) => row.tenant_id === tenantId && row.session_key === sessionKey,
      );
      if (existing) return [];
      seq += 1;
      const row: SessionRow = {
        session_id: `sess_${seq}`,
        tenant_id: tenantId,
        session_key: sessionKey,
        status: "PENDING",
        config: JSON.parse(configJson),
        summary: null,
        created_at: "2026-09-01T08:00:00.000Z",
        updated_at: "2026-09-01T08:00:00.000Z",
      };
      sessions.set(row.session_id, row);
      return [row];
    }
    if (query.includes("FROM employee_work_sessions")) {
      const [sessionId] = values as [string];
      const row = sessions.get(sessionId);
      return row ? [row] : [];
    }
    if (query.includes("UPDATE employee_work_sessions")) {
      // Echte SQL: status, summary, status (CASE WHEN), session_id → 4 waarden.
      const [status, summaryJson, , sessionId] = values as [string, string | null, string, string];
      const row = sessions.get(sessionId);
      if (row) {
        row.status = status;
        row.summary = summaryJson ? JSON.parse(summaryJson) : null;
        row.updated_at = "2026-09-01T09:00:00.000Z";
      }
      return [];
    }
    return [];
  };
  return { sql, sessions };
}

function makeProvider() {
  let sent = 0;
  const provider: EmailProvider = {
    send: async () => {
      sent += 1;
      return { providerMessageId: "p-1" };
    },
  };
  return { provider, sent: () => sent };
}

async function makeWaitingSession(sql: EmployeeSql, sessionKey: string) {
  const config: EmployeeWorkSessionConfig = {
    tenantId: TENANT_ID,
    sessionKey,
    companies: [],
    limit: 1,
  };
  const started = await startWorkSession(config, { sql });
  // startWorkSession met 0 kandidaten eindigt COMPLETED; bouw handmatig de
  // WAITING_APPROVAL-staat op via de repository-functies.
  const { getWorkSession, updateWorkSessionStatus } = await import(
    "../lib/autonomous-employee/work-session-repository.ts"
  );
  const summary: EmployeeWorkSessionSummary = {
    sessionId: started.sessionId,
    tenantId: TENANT_ID,
    sessionKey,
    status: "WAITING_APPROVAL",
    decisions: [],
    actions: [
      {
        actionId: "action_1",
        domain: "acme.nl",
        subject: "Acme: reducing bottlenecks safely",
        body: "Hi there",
        optOutLine: "reply opt out",
        status: "PENDING_APPROVAL",
      },
    ],
    qualified: 0,
    drafts: 1,
    waitingApproval: 1,
    blocked: 0,
  };
  await updateWorkSessionStatus(sql, started.sessionId, "WAITING_APPROVAL", summary);
  return (await getWorkSession(sql, started.sessionId))!;
}

test("orchestrator: approveAction legt approval vast (PENDING → APPROVED) en stuurt", async () => {
  const { sql } = makeSessionSql();
  const approvals = createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z");
  const { provider, sent } = makeProvider();
  const session = await makeWaitingSession(sql, "day-approve");

  const result = await approveAction(
    session.sessionId,
    "action_1",
    { email: "owner@acme.nl", approver: "human@owner.nl" },
    { sql, provider, approvals },
  );
  assert.equal(result.actionStatus, "SENT");
  assert.equal(sent(), 1);

  const record = await approvals.get(createEmployeeApprovalId(session.sessionId, "action_1"));
  assert.equal(record?.status, "APPROVED");
  assert.equal(record?.approvedBy, "human@owner.nl");
  assert.equal(record?.requestedAction, "email_send:action_1");
});

test("orchestrator: approveAction zonder approver + store → APPROVER_REQUIRED (geen send)", async () => {
  const { sql } = makeSessionSql();
  const approvals = createInMemoryEmployeeApprovalStore();
  const { provider, sent } = makeProvider();
  const session = await makeWaitingSession(sql, "day-noapprover");

  await assert.rejects(
    approveAction(session.sessionId, "action_1", { email: "owner@acme.nl" }, { sql, provider, approvals }),
    /APPROVER_REQUIRED/,
  );
  assert.equal(sent(), 0);
});

test("orchestrator: rejectAction legt REJECTED vast; geen provider-call", async () => {
  const { sql } = makeSessionSql();
  const approvals = createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z");
  const { provider, sent } = makeProvider();
  const session = await makeWaitingSession(sql, "day-reject");

  const result = await rejectAction(session.sessionId, "action_1", { sql, provider, approvals }, "human@owner.nl");
  assert.equal(result.actionStatus, "REJECTED");
  assert.equal(sent(), 0);

  const record = await approvals.get(createEmployeeApprovalId(session.sessionId, "action_1"));
  assert.equal(record?.status, "REJECTED");
  assert.equal(record?.approvedBy, "human@owner.nl");
});

test("orchestrator: zonder store blijft het oude gedrag (backwards compatible)", async () => {
  const { sql } = makeSessionSql();
  const { provider, sent } = makeProvider();
  const session = await makeWaitingSession(sql, "day-oldbehavior");

  const result = await approveAction(
    session.sessionId,
    "action_1",
    { email: "owner@acme.nl" }, // géén approver, géén store → oude pad
    { sql, provider },
  );
  assert.equal(result.actionStatus, "SENT");
  assert.equal(sent(), 1);
});
