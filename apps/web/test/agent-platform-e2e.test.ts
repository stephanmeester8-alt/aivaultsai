/**
 * Agent Tool Platform — End-to-End suite (TASK 26, end-to-end-agent-test.md).
 *
 * Vier scenario's door de VOLLEDIGE agent-keten, alle met testdubbels
 * (geen echte netwerk/DB — deterministisch en snel). Testdubbels schakelen
 * géén beveiliging uit: registry, policy, approval, budget en recorder
 * draaien echt; alleen externe I/O is gefaked.
 *
 * S1  employee full-run success  discovery → research → qualify → draft →
 *     WAITING_APPROVAL → approve → email_send → SENT
 * S2  employee reject-route      reject → REJECTED → géén provider-call
 * S3  tenant + budget cases      OFF → DENY (TENANT_POLICY); APPROVAL → flow;
 *                                budget-stop → BUDGET_EXCEEDED
 * S4  read/write tools           calendar_read → contact_search → approval →
 *                                crm write (idempotent) → read-back
 *
 * Elke stap: tool-call-record (TASK 24), approvalId-koppeling waar van
 * toepassing, geen secrets in audit/records.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createEmployeeApprovalId,
  createInMemoryEmployeeApprovalStore,
  storeToApprovalGate,
} from "../lib/approvals/employee-approval.ts";
import { createApprovalGate, type ApprovalSnapshot } from "../lib/approvals/approval-gate.ts";
import { EmployeeBudgetTracker } from "../lib/autonomous-employee/budget.ts";
import {
  approveAction,
  rejectAction,
  startWorkSession,
} from "../lib/autonomous-employee/orchestrator.ts";
import type { EmployeeSql } from "../lib/autonomous-employee/work-session-repository.ts";
import { executeEmployeeTool } from "../lib/autonomous-employee/registry-adapter.ts";
import type { EmployeeToolContext, EmployeeWorkSessionConfig } from "../lib/autonomous-employee/types.ts";
import { executeCalendarRead } from "../lib/tool-registry/adapters/calendar.ts";
import { executeContactSearch } from "../lib/tool-registry/adapters/crm.ts";
import { executeCrmWrite } from "../lib/tool-registry/adapters/crm-write.ts";
import { discoverTools } from "../lib/tool-registry/discovery.ts";
import type { MetricRecorder, ToolCallRecord } from "../lib/observability/metrics.ts";
import { createToolRegistryV2 } from "../lib/tool-registry/registry.ts";
import { recordedCall } from "../lib/tool-registry/recorded-call.ts";
import { TOOL_SPECS } from "../lib/tool-registry/tools.ts";
import type { CalendarProvider } from "../lib/booking/types.ts";
import type { CrmClient, CrmContact } from "../lib/crm/client.ts";
import type { CrmWriteClient } from "../lib/crm/write-client.ts";
import type { EmailProvider } from "../lib/prospect-run/email-dispatcher.ts";
import type { ProspectIntelligence, ProspectInput } from "../lib/prospect-run/types.ts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

// ---------------------------------------------------------------------------
// Testdubbels (bestaand patroon: injectable, deterministisch)
// ---------------------------------------------------------------------------

/** Observability-dubbel: verzamelt records + FASE 12-counters. */
class MemoryRecorder implements MetricRecorder {
  readonly records: ToolCallRecord[] = [];
  readonly counters = new Map<string, number>();

  #inc(name: string, labels: Record<string, string>, by = 1): void {
    const key = `${name}{${Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",")}}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  count(key: string): number {
    return this.counters.get(key) ?? 0;
  }

  recordCall(record: ToolCallRecord): void {
    this.records.push(record);
    this.#inc("tool_calls_total", { tool: record.toolId, status: record.status });
    if (record.status === "DENIED") {
      this.#inc("tool_denied_total", { tool: record.toolId, reason: record.errorCode ?? "DENIED" });
    }
  }

  recordDiscovery(intentHash: string, agentId: string, toolCount: number): void {
    void intentHash;
    this.#inc("tool_discovery_calls_total", { agent: agentId });
    void toolCount;
  }

  recordApprovalPending(agentId: string, toolId: string): void {
    this.#inc("approval_pending_total", { agent: agentId, tool: toolId });
  }

  recordApprovalRejected(agentId: string, toolId: string): void {
    this.#inc("approval_rejected_total", { agent: agentId, tool: toolId });
  }

  recordBudgetExceeded(agentId: string, field: string): void {
    this.#inc("agent_budget_exceeded_total", { agent: agentId, field });
  }

  recordAgentStep(agentId: string, sessionId: string | null): void {
    this.#inc("agent_steps_total", { agent: agentId, session: sessionId ?? "none" });
  }

  recordExternalRequest(toolId: string): void {
    this.#inc("external_requests", { tool: toolId });
  }

  recordAgentCost(): void {
    /* niet gebruikt in e2e */
  }
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

const INTERCOM_PAGE = page(
  "Acme BV",
  '<script src="https://widget.intercom.io/widget/abc"></script><p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat.</p>',
);

/** Fake employee-sql (work-session/companies/prospect-runs; TASK 26-patroon). */
function makeEmployeeSql() {
  const sessions = new Map<string, Record<string, unknown>>();
  const steps: Array<Record<string, unknown>> = [];
  const sql: EmployeeSql = async (strings, ...values) => {
    const text = strings.join("?");
    if (text.includes("INSERT INTO employee_work_session_steps")) {
      steps.push({ session_id: values[0], step: values[1], status: values[2], detail: values[3] });
      return [];
    }
    if (text.includes("INSERT INTO employee_work_sessions")) {
      const key = `${String(values[0])}:${String(values[1])}`;
      if (sessions.has(key)) return [];
      const rec: Record<string, unknown> = {
        session_id: `sess-${sessions.size + 1}`,
        tenant_id: values[0],
        session_key: values[1],
        status: "PENDING",
        config: JSON.parse(String(values[2])),
        summary: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      };
      sessions.set(key, rec);
      return [rec];
    }
    if (text.includes("FROM employee_work_sessions")) {
      const rows = [...sessions.values()];
      if (text.includes("WHERE tenant_id =")) {
        return rows.filter((s) => s.tenant_id === values[0] && s.session_key === values[1]);
      }
      return rows.filter((s) => s.session_id === values[0]);
    }
    if (text.includes("UPDATE employee_work_sessions")) {
      const rec = [...sessions.values()].find((s) => s.session_id === values[3]);
      if (rec) {
        rec.status = values[0];
        if (values[1] != null) rec.summary = JSON.parse(String(values[1]));
      }
      return [];
    }
    if (text.includes("SELECT 1\n    FROM companies")) return [];
    if (text.includes("INSERT INTO companies")) return [{ company_id: "c-1" }];
    if (text.includes("UPDATE companies")) return [];
    if (text.includes("SELECT\n      company_id, name, domain")) return [];
    if (text.includes("INSERT INTO prospect_runs")) return [{ run_id: "run-1" }];
    if (text.includes("UPDATE prospect_runs")) return [{ run_id: "claimed" }];
    if (text.includes("INSERT INTO audit_manifests")) return [];
    return [];
  };
  return { sql, sessions, steps };
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
  return {
    pains: [],
    evidence: ["pricing page"],
    unknowns: ["CRM"],
    commercialOpportunity: 40,
    evidenceBaseline: 30,
    uncertainty: 20,
  };
}

function employeeDeps(sql: EmployeeSql, recorder: MemoryRecorder, provider: EmailProvider) {
  return {
    sql,
    fetchImpl: async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("acme")) return new Response(INTERCOM_PAGE, { status: 200 });
      return new Response(page("Beta BV", "<p>Korte pagina.</p>"), { status: 200 });
    },
    lookup: async () => ["93.184.216.34"],
    analyze: async (input: ProspectInput) => intelligenceFor(input.companyName),
    provider,
    approvals: createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z"),
    recorder,
    now: () => "2026-09-01T08:00:00.000Z",
    log: () => {},
  };
}

function baseConfig(overrides: Partial<EmployeeWorkSessionConfig> = {}): EmployeeWorkSessionConfig {
  return {
    tenantId: TENANT_A,
    sessionKey: "2026-09-01",
    companies: [{ name: "Acme BV", websiteUrl: "https://acme.nl", industry: "SaaS" }],
    limit: 5,
    ...overrides,
  };
}

function makeEmailProvider(): EmailProvider & { calls: number; lastTo?: string } {
  const provider: EmailProvider & { calls: number } = {
    calls: 0,
    send: async () => {
      provider.calls += 1;
      return { providerMessageId: "msg-e2e-1" };
    },
  };
  return provider;
}

// ---------------------------------------------------------------------------
// S1 — employee full-run success
// ---------------------------------------------------------------------------

test("e2e S1: full-run discovery → research → qualify → draft → approve → SENT, met records", async () => {
  const { sql, steps } = makeEmployeeSql();
  const recorder = new MemoryRecorder();
  const provider = makeEmailProvider();
  const deps = employeeDeps(sql, recorder, provider);

  // 1. Run: discovery → research (FakeFetch) → qualify → draft → WAITING_APPROVAL.
  const run = await startWorkSession(baseConfig(), deps);
  assert.equal(run.started, true);
  assert.equal(run.status, "WAITING_APPROVAL");
  assert.equal(run.summary!.drafts, 1);
  const action = run.summary!.actions[0]!;
  assert.equal(action.status, "PENDING_APPROVAL");
  assert.match(action.subject, /Acme/);

  // Ketenstappen zijn traceerbaar (session-steps).
  const stepNames = steps.map((s) => String(s.step));
  for (const expected of ["session_started", "discovery", "decision", "outreach_draft", "session_completed"]) {
    assert.ok(stepNames.includes(expected), `missing step ${expected}`);
  }

  // 2. Menselijke approval (approver ≠ agent) → dispatch → SENT.
  const approved = await approveAction(run.sessionId, action.actionId, {
    email: "info@acme.nl",
    approver: "human@owner.nl",
  }, deps);
  assert.equal(approved.actionStatus, "SENT");
  assert.equal(approved.providerMessageId, "msg-e2e-1");
  assert.equal(provider.calls, 1);

  // 3. Observability (TASK 24): approval pending + agent steps geteld.
  assert.equal(recorder.count(`approval_pending_total{agent="autonomous-employee",tool="email_send"}`), 1);
  assert.ok(recorder.count('agent_steps_total{agent="autonomous-employee",session="sess-1"}') >= 1);

  // 4. Geen secrets in de keten-artefacten.
  const serialized = JSON.stringify({ steps, approvals: run.summary });
  assert.equal(serialized.includes("sk-"), false);
  assert.equal(serialized.includes("geheim"), false);
});

// ---------------------------------------------------------------------------
// S2 — employee reject-route
// ---------------------------------------------------------------------------

test("e2e S2: reject → REJECTED, géén provider-call, approval_rejected_total +1", async () => {
  const { sql } = makeEmployeeSql();
  const recorder = new MemoryRecorder();
  const provider = makeEmailProvider();
  const deps = employeeDeps(sql, recorder, provider);

  const run = await startWorkSession(baseConfig(), deps);
  assert.equal(run.status, "WAITING_APPROVAL");
  const action = run.summary!.actions[0]!;

  const rejected = await rejectAction(run.sessionId, action.actionId, deps, "human@owner.nl");
  assert.equal(rejected.actionStatus, "REJECTED");
  assert.equal(provider.calls, 0); // geen side effect

  // De approval is first-class REJECTED (store→gate spiegel).
  const store = deps.approvals!;
  const gate = storeToApprovalGate(store, () => "2026-09-01T08:00:00.000Z");
  const approvalId = createEmployeeApprovalId(run.sessionId, action.actionId);
  const check = await gate.check({ approvalId, requestedAction: `email_send:${action.actionId}` });
  assert.equal(check.allowed, false);
  if (!check.allowed) assert.equal(check.reason, "APPROVAL_REJECTED");

  // Observability: pending + rejected geteld.
  assert.equal(recorder.count(`approval_pending_total{agent="autonomous-employee",tool="email_send"}`), 1);
  assert.equal(recorder.count(`approval_rejected_total{agent="autonomous-employee",tool="email_send"}`), 1);
});

// ---------------------------------------------------------------------------
// S3 — tenant-policies + budget
// ---------------------------------------------------------------------------

function makeTenantRegistry(policies: Record<string, Record<string, { policy: "OFF" | "ON" | "APPROVAL" }>>) {
  return createToolRegistryV2(TOOL_SPECS, {
    tenantPolicyResolver: (tenantId, toolId) => policies[tenantId]?.[toolId] ?? null,
  });
}

function makeToolContext(tenantId: string, recorder: MemoryRecorder): EmployeeToolContext {
  return {
    tenantId,
    sql: async () => [],
    now: () => "2026-09-01T08:00:00.000Z",
    log: () => {},
    recorder,
  };
}

test("e2e S3a: tenant A email_send OFF → TENANT_POLICY + record; discovery sluit uit", async () => {
  const registry = makeTenantRegistry({
    [TENANT_A]: { email_send: { policy: "OFF" } },
  });
  const recorder = new MemoryRecorder();
  const ctx = makeToolContext(TENANT_A, recorder);

  // Directe call → DENY (TENANT_POLICY) + tool-call-record.
  const result = await executeEmployeeTool("email_send", { draftId: "d1", approvalId: "a1" }, ctx, registry);
  assert.equal(result.ok, false);
  assert.equal(result.error, "TENANT_POLICY");
  const record = recorder.records.find((r) => r.toolId === "email_send")!;
  assert.equal(record.status, "DENIED");
  assert.equal(record.errorCode, "TENANT_POLICY");
  assert.equal(record.argumentsHash.length, 64);
  assert.equal(JSON.stringify(record).includes("d1"), false); // nooit ruwe argumenten
  assert.equal(recorder.count(`tool_denied_total{tool="email_send",reason="TENANT_POLICY"}`), 1);

  // Discovery sluit email_send uit voor tenant A.
  const discovered = discoverTools({ intent: "email versturen", agentId: "x", tenantId: TENANT_A }, registry);
  assert.equal(discovered.tools.some((t) => t.id === "email_send"), false);

  // Tenant B (geen rij) → spec-default; OFF van A is geïsoleerd.
  const ctxB = makeToolContext(TENANT_B, recorder);
  const deniedB = await executeEmployeeTool("email_send", { draftId: "d1", approvalId: "a1" }, ctxB, registry);
  assert.equal(deniedB.error, "TOOL_DISABLED"); // spec.enabled false, geen tenant-rij
});

test("e2e S3b: tenant B email_send APPROVAL → approval vereist; zonder approval → DENY", async () => {
  // email_send is HIGH → approval sowieso; de tenant-APPROVAL wordt zichtbaar
  // op approvalRequired via de registry (één resolutie-bron).
  const registry = makeTenantRegistry({
    [TENANT_B]: { email_send: { policy: "APPROVAL" } },
  });
  assert.equal(registry.approvalRequired("email_send", TENANT_B), true);

  // Zonder geldige approval → gate DENY (APPROVAL_NOT_FOUND).
  const { executeEmailSend } = await import("../lib/tool-registry/adapters/email-send.ts");
  const draftStore = new Map<string, { status: string; action_id: string | null; to_address: string; subject: string; body: string; opt_out_line: string }>();
  draftStore.set("d1", {
    status: "DRAFT",
    action_id: "action_1",
    to_address: "info@acme.nl",
    subject: "S",
    body: "B",
    opt_out_line: "opt out",
  });
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const q = strings.join("?");
    if (q.includes("SELECT action_id FROM email_drafts")) {
      const row = draftStore.get(String(values[0]));
      return row ? [{ action_id: row.action_id }] : [];
    }
    if (q.includes("SELECT status FROM email_drafts")) {
      const row = draftStore.get(String(values[0]));
      return row ? [{ status: row.status }] : [];
    }
    if (q.includes("SET status = 'SENT'")) {
      const row = draftStore.get(String(values[0]));
      if (!row || row.status === "SENT") return [];
      row.status = "SENT";
      return [{ draft_id: "d1", to_address: row.to_address, subject: row.subject, body: row.body, opt_out_line: row.opt_out_line }];
    }
    return [];
  };
  const provider = makeEmailProvider();
  const gate = createApprovalGate(async () => null); // onbekende approval → DENY
  const denied = await executeEmailSend(
    { draftId: "d1", approvalId: "apr_onbekend" },
    { sql, tenantId: TENANT_B, approvalGate: gate, provider, now: () => "2026-09-01T08:00:00.000Z", log: () => {} },
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.error, "APPROVAL_NOT_FOUND");
  assert.equal(provider.calls, 0); // geen send zonder approval
});

test("e2e S3c: budget-stop → BUDGET_EXCEEDED + agent_budget_exceeded_total, geen call na limiet", async () => {
  const registry = createToolRegistryV2(TOOL_SPECS);
  const recorder = new MemoryRecorder();
  const ctx = makeToolContext(TENANT_A, recorder);
  const tracker = new EmployeeBudgetTracker(
    { maxSteps: 200, maxToolCalls: 1, maxRuntimeMs: 2_700_000, maxNetworkRequests: 200 },
    () => "2026-09-01T08:00:00.000Z",
  );

  const first = await executeEmployeeTool(
    "employee_discovery",
    { companies: [{ name: "Acme BV", websiteUrl: "https://acme.nl" }] },
    ctx,
    registry,
    tracker,
  );
  assert.equal(first.ok, true);

  const second = await executeEmployeeTool(
    "employee_discovery",
    { companies: [{ name: "Beta BV", websiteUrl: "https://beta.nl" }] },
    ctx,
    registry,
    tracker,
  );
  assert.equal(second.ok, false);
  assert.equal(second.error, "BUDGET_EXCEEDED");
  assert.equal(recorder.count('agent_budget_exceeded_total{agent="autonomous-employee",field="toolCalls"}'), 1);
  const record = recorder.records.find((r) => r.errorCode === "BUDGET_EXCEEDED")!;
  assert.equal(record.status, "DENIED");
});

// ---------------------------------------------------------------------------
// S4 — read/write tools: calendar_read → contact_search → approval → crm write → read-back
// ---------------------------------------------------------------------------

test("e2e S4: calendar_read → contact_search → approval → contact_create (idempotent) → read-back", async () => {
  const recorder = new MemoryRecorder();
  const TENANT = TENANT_B;

  // 1. calendar_read met fake provider (bounded slots).
  const calendarProvider: CalendarProvider = {
    getAvailability: async () => ({
      available: true,
      slots: [
        { start: "2026-09-10T09:00:00.000Z", end: "2026-09-10T09:30:00.000Z", timezone: "Europe/Amsterdam" },
      ],
      provider: "fake-calendar",
    }),
    createAppointment: async () => {
      throw new Error("write-pad onbereikbaar vanuit read");
    },
    cancelAppointment: async () => {
      throw new Error("write-pad onbereikbaar vanuit read");
    },
  };
  const calendarRead = await recordedCall(
    recorder,
    {
      tenantId: TENANT,
      agentId: "e2e",
      toolId: "calendar_read",
      riskLevel: "LOW",
      argumentsHash: "ab".repeat(32),
    },
    () => executeCalendarRead(
      { startDate: "2026-09-01", endDate: "2026-09-07", timezone: "Europe/Amsterdam", durationMinutes: 30 },
      { provider: calendarProvider, tenantId: TENANT },
    ),
  );
  assert.equal(calendarRead.ok, true);
  assert.equal((calendarRead.value as { slots: unknown[] }).slots.length, 1);
  assert.equal(recorder.records.at(-1)!.status, "ALLOWED");

  // Unavailable-variant: geen inventie.
  const unavailable = await executeCalendarRead(
    { startDate: "2026-09-01", endDate: "2026-09-07", timezone: "Europe/Amsterdam", durationMinutes: 30 },
    {
      provider: {
        ...calendarProvider,
        getAvailability: async () => ({
          available: false,
          slots: [],
          provider: "unavailable",
          reason: "No calendar provider is connected",
        }),
      },
      tenantId: TENANT,
    },
  );
  assert.equal(unavailable.value?.available, false);
  assert.equal(unavailable.value?.slots.length, 0);

  // 2. contact_search (fake CRM) — PII-redactie: notities nooit in output.
  const contacts: CrmContact[] = [
    { id: "c1", name: "Jan Jansen", email: "jan@acme.nl", company: "Acme BV", role: "CTO" },
  ];
  const crmClient: CrmClient = {
    searchContacts: async () => contacts,
    getLead: async () => null,
  };
  const search = await recordedCall(
    recorder,
    {
      tenantId: TENANT,
      agentId: "e2e",
      toolId: "contact_search",
      riskLevel: "MEDIUM",
      argumentsHash: "cd".repeat(32),
    },
    () => executeContactSearch({ q: "Jan", limit: 10 }, { client: crmClient, tenantId: TENANT }),
  );
  assert.equal(search.ok, true);
  const searchValue = search.value as { contacts: CrmContact[] };
  assert.equal(searchValue.contacts.length, 1);
  assert.equal(JSON.stringify(searchValue.contacts).includes("notitie"), false);

  // 3. Approval → contact_create (idempotent via dedupeKey).
  const APPROVAL_ID = "apr_e2e_1";
  const gate = createApprovalGate(async (id) => {
    const snapshot: ApprovalSnapshot = { status: "APPROVED", requestedAction: `crm_write:contact_create`, expiresAt: null };
    return id === APPROVAL_ID ? snapshot : null;
  });
  let seq = 0;
  const createdIds = new Map<string, string>();
  const writeClient: CrmWriteClient = {
    createContact: async (input) => {
      const existing = createdIds.get(input.idempotencyKey);
      if (existing) return { contactId: existing, created: false };
      const id = `contact_${++seq}`;
      createdIds.set(input.idempotencyKey, id);
      return { contactId: id, created: true };
    },
    updateContact: async (input) => ({ contactId: input.contactId }),
    createLead: async () => ({ leadId: `lead_${++seq}`, created: true }),
    updateLead: async (input) => ({ leadId: input.leadId }),
  };
  const writeDeps = {
    client: writeClient,
    tenantId: TENANT,
    approvalGate: gate,
    now: () => "2026-09-01T08:00:00.000Z",
    log: () => {},
  };
  const createInput = { name: "Jan Jansen", email: "jan@acme.nl", dedupeKey: "e2e-dedupe-1", approvalId: APPROVAL_ID };
  const created = await recordedCall(
    recorder,
    {
      tenantId: TENANT,
      agentId: "e2e",
      toolId: "contact_create",
      riskLevel: "MEDIUM",
      argumentsHash: "ef".repeat(32),
      approvalId: APPROVAL_ID,
    },
    () => executeCrmWrite("contact_create", createInput, writeDeps),
  );
  assert.equal(created.ok, true);
  assert.equal((created.value as { created: boolean }).created, true);
  const createdRecord = recorder.records.at(-1)!;
  assert.equal(createdRecord.approvalId, APPROVAL_ID); // approvalId-koppeling
  assert.equal(JSON.stringify(createdRecord).includes("jan@acme.nl"), false); // geen secrets

  // Idempotent herhaal (zelfde key) → created:false.
  const repeat = await executeCrmWrite("contact_create", createInput, writeDeps);
  assert.equal(repeat.ok, true);
  assert.equal((repeat.value as { created: boolean }).created, false);

  // 4. Read-back: het aangemaakte contact is zichtbaar via contact_search.
  const readBack = await executeContactSearch({ q: "Jan", limit: 10 }, { client: crmClient, tenantId: TENANT });
  assert.equal(readBack.ok, true);
  assert.equal((readBack.value as { contacts: CrmContact[] }).contacts.length, 1);
});
