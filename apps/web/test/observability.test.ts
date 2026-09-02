import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NoopRecorder,
  type MetricRecorder,
  type ToolCallRecord,
} from "../lib/observability/metrics.ts";
import {
  PostgresRecorder,
  type ObservabilitySql,
} from "../lib/observability/postgres-recorder.ts";
import { recordedCall } from "../lib/tool-registry/recorded-call.ts";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const ARGS_HASH = "ab".repeat(32); // 64 hex — SHA-256 shape

function fakeSql(): { sql: ObservabilitySql; inserts: { query: string; values: unknown[] }[] } {
  const inserts: { query: string; values: unknown[] }[] = [];
  const sql: ObservabilitySql = async (strings, ...values) => {
    inserts.push({ query: strings[0]!, values });
    return [];
  };
  return { sql, inserts };
}

function baseRecord(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return {
    executionId: "ex-1",
    tenantId: TENANT_ID,
    agentId: "autonomous-employee",
    sessionId: "sess-1",
    toolId: "contact_search",
    argumentsHash: ARGS_HASH,
    startedAt: "2026-09-01T08:00:00.000Z",
    finishedAt: "2026-09-01T08:00:00.100Z",
    status: "ALLOWED",
    riskLevel: "MEDIUM",
    approvalId: null,
    resultSummary: "ok",
    errorCode: null,
    evidenceRefs: ["run-1"],
    ...overrides,
  };
}

test("observability: ALLOWED-call → record + tool_calls_total + latency", async () => {
  const { sql, inserts } = fakeSql();
  const recorder = new PostgresRecorder(sql);
  await recorder.recordCall(baseRecord());
  assert.equal(inserts.length, 1);
  assert.match(inserts[0]!.query, /INSERT INTO tool_call_records/);
  // execution_id, tenant_id, agent_id, tool_id, arguments_hash in de values
  const values = inserts[0]!.values;
  assert.equal(values[0], "ex-1");
  assert.equal(values[1], TENANT_ID);
  assert.equal(values[2], "autonomous-employee");
  assert.equal(values[4], "contact_search");
  assert.equal(values[5], ARGS_HASH); // nooit ruwe argumenten

  const snapshot = recorder.snapshot();
  assert.equal(snapshot.counters["tool_calls_total{tool=\"contact_search\",agent=\"autonomous-employee\",status=\"ALLOWED\"}"], 1);
  assert.deepEqual(snapshot.histograms["tool_latency_ms{tool=\"contact_search\"}"], { sum: 100, count: 1 });
});

test("observability: DENIED-call → record + tool_denied_total", async () => {
  const { sql } = fakeSql();
  const recorder = new PostgresRecorder(sql);
  await recorder.recordCall(
    baseRecord({ status: "DENIED", errorCode: "TENANT_REQUIRED", resultSummary: "TENANT_REQUIRED" }),
  );
  const counters = recorder.snapshot().counters;
  assert.equal(counters["tool_calls_total{tool=\"contact_search\",agent=\"autonomous-employee\",status=\"DENIED\"}"], 1);
  assert.equal(counters["tool_denied_total{tool=\"contact_search\",reason=\"TENANT_REQUIRED\"}"], 1);
  assert.equal(Object.keys(counters).filter((k) => k.startsWith("tool_failures_total")).length, 0);
});

test("observability: ERROR en TIMEOUT → record + tool_failures_total", async () => {
  const { sql } = fakeSql();
  const recorder = new PostgresRecorder(sql);
  await recorder.recordCall(baseRecord({ status: "ERROR", errorCode: "CRM_CLIENT_ERROR", resultSummary: "failed" }));
  await recorder.recordCall(baseRecord({ executionId: "ex-2", status: "TIMEOUT", errorCode: "TIMEOUT", resultSummary: "timeout" }));
  const counters = recorder.snapshot().counters;
  assert.equal(counters["tool_failures_total{tool=\"contact_search\",errorCode=\"CRM_CLIENT_ERROR\"}"], 1);
  assert.equal(counters["tool_failures_total{tool=\"contact_search\",errorCode=\"TIMEOUT\"}"], 1);
  assert.equal(Object.keys(counters).filter((k) => k.startsWith("tool_denied_total")).length, 0);
});

test("observability: NOT_IMPLEMENTED → record, geen denied/failures-teller", async () => {
  const { sql } = fakeSql();
  const recorder = new PostgresRecorder(sql);
  await recorder.recordCall(
    baseRecord({ status: "NOT_IMPLEMENTED", errorCode: "NOT_IMPLEMENTED", resultSummary: "NOT_IMPLEMENTED" }),
  );
  const snapshot = recorder.snapshot();
  assert.equal(snapshot.counters["tool_calls_total{tool=\"contact_search\",agent=\"autonomous-employee\",status=\"NOT_IMPLEMENTED\"}"], 1);
  assert.equal(Object.keys(snapshot.counters).filter((k) => k.startsWith("tool_denied_total") || k.startsWith("tool_failures_total")).length, 0);
});

test("observability: recorder-fout is non-fatal — DB-down breekt de call niet", async () => {
  const throwing: ObservabilitySql = async () => {
    throw new Error("database unavailable");
  };
  const recorder = new PostgresRecorder(throwing);
  await recorder.recordCall(baseRecord()); // mag niet gooien
  assert.ok(true);
  // Metrics blijven gewoon bijgewerkt (in-memory, onafhankelijk van DB).
  assert.equal(recorder.snapshot().counters["tool_calls_total{tool=\"contact_search\",agent=\"autonomous-employee\",status=\"ALLOWED\"}"], 1);
});

test("observability: result_summary wordt gebounded op 200 tekens (contract)", async () => {
  const { sql, inserts } = fakeSql();
  const recorder = new PostgresRecorder(sql);
  await recorder.recordCall(baseRecord({ resultSummary: "x".repeat(300) }));
  const summaryValue = inserts[0]!.values[9] as string;
  assert.equal(summaryValue.length, 200);
});

test("observability: approval/budget/discovery/cost counters", async () => {
  const { sql } = fakeSql();
  const recorder = new PostgresRecorder(sql);
  recorder.recordApprovalPending("autonomous-employee", "email_send");
  recorder.recordApprovalRejected("autonomous-employee", "email_send");
  recorder.recordBudgetExceeded("autonomous-employee", "maxSteps");
  recorder.recordDiscovery("hash", "autonomous-employee", 4);
  recorder.recordDiscovery("hash", "autonomous-employee", 6);
  recorder.recordAgentStep("autonomous-employee", "sess-1");
  recorder.recordExternalRequest("employee_website_research");
  recorder.recordAgentCost("autonomous-employee", TENANT_ID, 0.01, 500);
  const counters = recorder.snapshot().counters;
  assert.equal(counters["approval_pending_total{agent=\"autonomous-employee\",tool=\"email_send\"}"], 1);
  assert.equal(counters["approval_rejected_total{agent=\"autonomous-employee\",tool=\"email_send\"}"], 1);
  assert.equal(counters["agent_budget_exceeded_total{agent=\"autonomous-employee\",field=\"maxSteps\"}"], 1);
  assert.equal(counters["tool_discovery_calls_total{agent=\"autonomous-employee\"}"], 2);
  assert.equal(counters["agent_steps_total{agent=\"autonomous-employee\",session=\"sess-1\"}"], 1);
  assert.equal(counters["external_requests{tool=\"employee_website_research\"}"], 1);
  assert.equal(counters["agent_cost{agent=\"autonomous-employee\",tenant=\"11111111-1111-1111-1111-111111111111\"}"], 0.01);
  assert.equal(counters["agent_tokens{agent=\"autonomous-employee\",tenant=\"11111111-1111-1111-1111-111111111111\"}"], 500);
  const histograms = recorder.snapshot().histograms;
  assert.deepEqual(histograms["tools_per_discovery{agent=\"autonomous-employee\"}"], { sum: 10, count: 2 });
});

test("recordedCall: ALLOWED outcome → record met status ALLOWED + unieke executionId (concurrent)", async () => {
  const records: ToolCallRecord[] = [];
  const recorder: MetricRecorder = { recordCall: (r) => void records.push(r), recordDiscovery: () => {} };
  const now = () => "2026-09-01T08:00:00.000Z";
  const options = {
    tenantId: TENANT_ID,
    agentId: "autonomous-employee",
    sessionId: "sess-1",
    toolId: "contact_search",
    riskLevel: "MEDIUM" as const,
    argumentsHash: ARGS_HASH,
    approvalId: "apr_1",
    resultSummary: "{count:2}",
    evidenceRefs: ["run-1"],
    now,
  };
  const [a, b] = await Promise.all([
    recordedCall(recorder, options, async () => ({ ok: true, value: { count: 2 } })),
    recordedCall(recorder, options, async () => ({ ok: true, value: { count: 3 } })),
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(records.length, 2);
  assert.notEqual(records[0]!.executionId, records[1]!.executionId); // uniek (concurrent)
  assert.equal(records[0]!.status, "ALLOWED");
  assert.equal(records[0]!.sessionId, "sess-1"); // correlatie
  assert.equal(records[0]!.approvalId, "apr_1"); // correlatie
  assert.equal(records[0]!.resultSummary, "{count:2}");
  assert.equal(records[0]!.errorCode, null);
  assert.equal(records[0]!.startedAt, records[0]!.finishedAt); // now() fixed in test
});

test("recordedCall: status-bepaling DENIED / NOT_IMPLEMENTED / ERROR", async () => {
  const records: ToolCallRecord[] = [];
  const recorder: MetricRecorder = { recordCall: (r) => void records.push(r), recordDiscovery: () => {} };
  const options = {
    tenantId: TENANT_ID,
    agentId: "a",
    toolId: "x",
    riskLevel: "LOW" as const,
    argumentsHash: ARGS_HASH,
  };
  await recordedCall(recorder, options, async () => ({ ok: false, error: "TENANT_REQUIRED" }));
  await recordedCall(recorder, options, async () => ({ ok: false, error: "NOT_IMPLEMENTED" }));
  await recordedCall(recorder, options, async () => ({ ok: false, error: "CRM_CLIENT_ERROR" }));
  assert.deepEqual(records.map((r) => r.status), ["DENIED", "NOT_IMPLEMENTED", "ERROR"]);
  assert.deepEqual(records.map((r) => r.errorCode), ["TENANT_REQUIRED", "NOT_IMPLEMENTED", "CRM_CLIENT_ERROR"]);
});

test("recordedCall: TIMEOUT → status TIMEOUT; onverwachte throw → ERROR", async () => {
  const records: ToolCallRecord[] = [];
  const recorder: MetricRecorder = { recordCall: (r) => void records.push(r), recordDiscovery: () => {} };
  const options = {
    tenantId: TENANT_ID,
    agentId: "a",
    toolId: "x",
    riskLevel: "LOW" as const,
    argumentsHash: ARGS_HASH,
    timeoutMs: 5,
  };
  const slow = await recordedCall(
    recorder,
    options,
    async (): Promise<{ ok: boolean; error?: string }> => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { ok: true };
    },
  );
  assert.equal(slow.ok, false);
  assert.equal(slow.error, "TIMEOUT");
  assert.equal(records[0]!.status, "TIMEOUT");

  const thrown = await recordedCall(
    recorder,
    { ...options, timeoutMs: undefined },
    async (): Promise<{ ok: boolean; error?: string }> => {
      throw new Error("kapot");
    },
  );
  assert.equal(thrown.ok, false);
  assert.equal(records[1]!.status, "ERROR");
  assert.equal(records[1]!.errorCode, "kapot");
});

test("recordedCall: recorder-fout wordt geslikt (non-fatal) en zonder recorder is het no-op", async () => {
  const throwing: MetricRecorder = {
    recordCall: async () => {
      throw new Error("recorder kapot");
    },
    recordDiscovery: () => {},
  };
  const result = await recordedCall(
    throwing,
    { tenantId: TENANT_ID, agentId: "a", toolId: "x", riskLevel: "LOW", argumentsHash: ARGS_HASH },
    async () => ({ ok: true, value: 42 }),
  );
  assert.equal(result.ok, true); // beslissing blijft staan
  assert.equal(result.value, 42);

  // Geen recorder (undefined) → volledige no-op.
  const plain = await recordedCall(
    undefined,
    { tenantId: TENANT_ID, agentId: "a", toolId: "x", riskLevel: "LOW", argumentsHash: ARGS_HASH },
    async () => ({ ok: true }),
  );
  assert.equal(plain.ok, true);

  // NoopRecorder expliciet: geen throw, geen side effects.
  await NoopRecorder.recordCall(baseRecord());
  NoopRecorder.recordDiscovery("h", "a", 1);
  assert.ok(true);
});

test("observability: secrets nooit in record — alleen argumentsHash + compacte summary", async () => {
  const records: ToolCallRecord[] = [];
  const recorder: MetricRecorder = { recordCall: (r) => void records.push(r), recordDiscovery: () => {} };
  await recordedCall(
    recorder,
    {
      tenantId: TENANT_ID,
      agentId: "a",
      toolId: "email_send",
      riskLevel: "HIGH",
      argumentsHash: ARGS_HASH,
    },
    async () => ({ ok: false, error: "APPROVAL_NOT_FOUND" }),
  );
  const serialized = JSON.stringify(records[0]);
  assert.equal(serialized.includes(ARGS_HASH), true);
  assert.equal(serialized.includes("geheim-wachtwoord"), false);
  assert.equal(serialized.includes("jan@acme.nl"), false);
  assert.ok(!("arguments" in records[0]!));
});
