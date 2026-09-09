/**
 * Sprint 4 — Live Assistant Unified Runtime: BEFORE≈AFTER regressies.
 *
 * Doel: bewijzen dat de migratie van de live /api/assistant naar de unified
 * Sprint 1-3-pipeline (deterministische skill-selectie → SkillExecutionRouter
 * → policy/risk/approval → ToolRegistryV2-gateway → executor → recorder)
 * geen functionele regressie oplevert voor websitebezoekers.
 *
 * Niveau 1 (functioneel): tool-loop + live-execution met identieke
 * fake-uitkomsten leveren dezelfde resultaten als vóór de migratie
 * (directe adapter-uitvoering) — tekst, continuations en foutvorm.
 * Niveau 2 (router): alle security-paden (tenant/policy/tool-fouten) met
 * recorder/audit-asserties (tenantId + executionId op élke tool-call).
 * Niveau 3 (route-guards): de route zelf blijft dezelfde request-lagen
 * gebruiken (parse/rate limit/funnel) en bevat géén directe adapter-bypass.
 *
 * Security-hardening (expliciet gedocumenteerd verschil): een falende tool
 * geeft het model een fail-closed router-code terug (EXECUTION_FAILED etc.)
 * i.p.v. interne foutdetails — de bezoeker ziet hetzelfde eerlijke
 * "niet gelukt"-antwoord; interne redenen blijven in de audit.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { maybeRunCustomerZeroOrchestration, type FunnelDeps } from "../lib/customer-zero/assistant-funnel.ts";
import { executeLiveAssistantToolCall, selectLiveSkill, type LiveCallContext } from "../lib/assistant/live-execution.ts";
import { runAssistantToolLoop } from "../lib/assistant/tool-loop.ts";
import type { AssistantToolExecution } from "../lib/agent-runtime/runtime-adapter.ts";
import type { MetricRecorder, ToolCallRecord } from "../lib/observability/metrics.ts";
import { createApprovalGate } from "../lib/approvals/approval-gate.ts";
import { createSkillRegistry } from "../lib/skills/registry.ts";
import { createCustomerInquirySkill } from "../lib/skills/definitions.ts";
import { createDefaultToolRegistry } from "../lib/tool-registry/tools.ts";
import { executeSkill } from "../lib/skills/router.ts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

// ---------------------------------------------------------------------------
// Testdubbels
// ---------------------------------------------------------------------------

class MemoryRecorder implements MetricRecorder {
  readonly records: ToolCallRecord[] = [];
  recordCall(record: ToolCallRecord): void {
    this.records.push(record);
  }
  recordDiscovery(): void {}
  recordApprovalPending(): void {}
  recordApprovalRejected(): void {}
  recordBudgetExceeded(): void {}
  recordAgentStep(): void {}
  recordExternalRequest(): void {}
  recordAgentCost(): void {}
}

function textResponse(text: string): unknown {
  return { output: [{ type: "message", content: [{ type: "output_text", text }] }] };
}

function toolResponse(callId: string, args: unknown): unknown {
  return {
    output: [
      {
        type: "function_call",
        call_id: callId,
        name: "assistant_website_research",
        arguments: JSON.stringify(args),
      },
    ],
  };
}

/** BEFORE-model: directe adapter-uitvoering zoals vóór Sprint 4. */
function beforeAdapterExecution(ok: boolean, output: unknown, error: string | null): AssistantToolExecution {
  return { ok, output, error, executionStatus: ok ? "SUCCEEDED" : "FAILED", evidenceIds: [] };
}

/** AFTER-model: unified live-execution met dezelfde fake-uitkomst. */
function makeLiveOptions(
  recorder: MemoryRecorder,
  outcome: { ok: boolean; value?: unknown; error?: string },
) {
  return {
    recorder,
    executors: {
      assistant_website_research: async () => outcome,
    } as const,
    approvalGate: createApprovalGate(async () => null),
    log: () => {},
  };
}

const CONTEXT: LiveCallContext = {
  tenantId: TENANT_A,
  conversationId: "11111111-1111-4111-8111-111111111111",
  sessionId: "sess-visitor-1",
};

function researchCall(args: unknown): { callId: string; name: string; arguments: string } {
  return { callId: "call-1", name: "assistant_website_research", arguments: JSON.stringify(args) };
}

// ---------------------------------------------------------------------------
// Niveau 1 — BEFORE≈AFTER (functioneel equivalent, zelfde fixtures)
// ---------------------------------------------------------------------------

test("regressie: normaal gesprek (tekst-only) → zelfde antwoord, géén tool-round", async () => {
  const recorder = new MemoryRecorder();
  const before = await runAssistantToolLoop({
    history: [],
    message: "Wat doet AIVaultsAI?",
    firstResponse: textResponse("AIVaultsAI bouwt websites en AI-assistenten."),
    modelCall: async () => ({ ok: true as const, data: null }),
    executeTool: async () => beforeAdapterExecution(true, null, null),
  });
  const after = await runAssistantToolLoop({
    history: [],
    message: "Wat doet AIVaultsAI?",
    firstResponse: textResponse("AIVaultsAI bouwt websites en AI-assistenten."),
    modelCall: async () => ({ ok: true as const, data: null }),
    executeTool: async (call) =>
      executeLiveAssistantToolCall(call, CONTEXT, makeLiveOptions(recorder, { ok: true, value: null })),
  });
  assert.equal(after.text, before.text);
  assert.equal(after.toolRounds, 0);
  assert.equal(recorder.records.length, 0); // geen tool → geen execution/records
});

test("regressie: commerciële vraag zonder tool-call → intent-analyse blijft buiten de tool-chain", async () => {
  const recorder = new MemoryRecorder();
  const before = await runAssistantToolLoop({
    history: [],
    message: "Ik wil graag een kennismaking plannen voor mijn bedrijf.",
    firstResponse: textResponse("Graag! Wanneer past een gesprek?"),
    modelCall: async () => ({ ok: true as const, data: null }),
    executeTool: async () => beforeAdapterExecution(true, null, null),
  });
  const after = await runAssistantToolLoop({
    history: [],
    message: "Ik wil graag een kennismaking plannen voor mijn bedrijf.",
    firstResponse: textResponse("Graag! Wanneer past een gesprek?"),
    modelCall: async () => ({ ok: true as const, data: null }),
    executeTool: async (call) =>
      executeLiveAssistantToolCall(call, CONTEXT, makeLiveOptions(recorder, { ok: true, value: null })),
  });
  assert.equal(after.text, before.text);
  assert.equal(after.toolRounds, 0);
  // Commercieel intent blijft een funnel/rule-based pad (klantvraag-analyse),
  // geen skill-uitvoering in de tool-chain van de live assistent.
  const skill = createCustomerInquirySkill();
  const outcome = await executeSkill(
    {
      skills: createSkillRegistry([skill]),
      tools: createDefaultToolRegistry(),
      executors: {},
      recorder: new MemoryRecorder(),
      approvalGate: null,
      log: () => {},
    },
    {
      skillId: "customer.inquiry",
      input: { question: "Ik wil een demo aanvragen voor mijn bedrijf." },
      context: { tenantId: TENANT_A, agentPermissions: [] },
    },
  );
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal((outcome.value as { level: string }).level, "HIGH_COMMERCIAL_INTENT");
});

test("regressie: prijsvraag → zelfde antwoord; prijzen blijven in de live prompt (geen tool nodig)", async () => {
  const route = readFileSync(join(import.meta.dirname, "..", "app", "api", "assistant", "route.ts"), "utf8");
  for (const price of ["€495", "€795", "€995"]) {
    assert.ok(route.includes(price), `prompt moet ${price} bevatten`);
  }
  const recorder = new MemoryRecorder();
  const after = await runAssistantToolLoop({
    history: [],
    message: "Wat kost een AI-assistent?",
    firstResponse: textResponse("Websites vanaf €495, Website + AI-assistent vanaf €795."),
    modelCall: async () => ({ ok: true as const, data: null }),
    executeTool: async (call) =>
      executeLiveAssistantToolCall(call, CONTEXT, makeLiveOptions(recorder, { ok: true, value: null })),
  });
  assert.equal(after.text, "Websites vanaf €495, Website + AI-assistent vanaf €795.");
  assert.equal(after.toolRounds, 0);
});

test("BEFORE≈AFTER: website research via unified pipeline geeft hetzelfde resultaat aan het model", async () => {
  const summary = { url: "https://example.com", title: "Example", visibleText: "kort", pagesChecked: ["https://example.com"] };

  const before = await runAssistantToolLoop({
    history: [],
    message: "Onderzoek example.com",
    firstResponse: toolResponse("call-1", { url: "https://example.com" }),
    modelCall: async (input) => {
      assert.ok(JSON.stringify(input).includes("function_call_output"));
      return { ok: true as const, data: textResponse("De website heeft geen chatbot gevonden.") };
    },
    executeTool: async () => beforeAdapterExecution(true, summary, null),
  });

  const recorder = new MemoryRecorder();
  const after = await runAssistantToolLoop({
    history: [],
    message: "Onderzoek example.com",
    firstResponse: toolResponse("call-1", { url: "https://example.com" }),
    modelCall: async (input) => {
      assert.ok(JSON.stringify(input).includes("function_call_output"));
      return { ok: true as const, data: textResponse("De website heeft geen chatbot gevonden.") };
    },
    executeTool: async (call) =>
      executeLiveAssistantToolCall(
        call,
        CONTEXT,
        makeLiveOptions(recorder, { ok: true, value: summary }),
      ),
  });

  assert.equal(after.text, before.text);
  assert.equal(after.toolRounds, 1);
  assert.deepEqual(after.toolResults[0]!.result.output, summary);
});

test("BEFORE≈AFTER: research-failure → zelfde functionele vorm (foutoutput naar model, eerlijk antwoord)", async () => {
  const before = await runAssistantToolLoop({
    history: [],
    message: "Onderzoek example.com",
    firstResponse: toolResponse("call-1", { url: "https://example.com" }),
    modelCall: async () => ({ ok: true as const, data: textResponse("Ik kon de website niet onderzoeken. Probeer het later opnieuw.") }),
    executeTool: async () => beforeAdapterExecution(false, null, "site down"),
  });

  const recorder = new MemoryRecorder();
  const after = await runAssistantToolLoop({
    history: [],
    message: "Onderzoek example.com",
    firstResponse: toolResponse("call-1", { url: "https://example.com" }),
    modelCall: async () => ({ ok: true as const, data: textResponse("Ik kon de website niet onderzoeken. Probeer het later opnieuw.") }),
    executeTool: async (call) =>
      executeLiveAssistantToolCall(call, CONTEXT, makeLiveOptions(recorder, { ok: false, error: "site down" })),
  });

  assert.equal(after.text, before.text);
  assert.equal(after.toolRounds, 1);
  // Gedocumenteerde security-hardening: fail-closed router-code i.p.v. interne
  // foutdetails; de tool-loop-uitkomst blijft functioneel identiek (error-output).
  assert.equal(after.toolResults[0]!.result.ok, false);
});

test("BEFORE≈AFTER: gespreksgeschiedenis wordt ongewijzigd meegestuurd (continuation met history)", async () => {
  const history = [{ role: "user" as const, content: "Eerder: ik bouw een website." }];
  const seen: unknown[][] = [];
  const recorder = new MemoryRecorder();
  const result = await runAssistantToolLoop({
    history,
    message: "En nu: onderzoek mijn site",
    firstResponse: toolResponse("call-1", { url: "https://example.com" }),
    modelCall: async (input) => {
      seen.push(input);
      return { ok: true as const, data: textResponse("Klaar.") };
    },
    executeTool: async (call) =>
      executeLiveAssistantToolCall(
        call,
        CONTEXT,
        makeLiveOptions(recorder, { ok: true, value: { url: "https://example.com", title: "Mijn site" } }),
      ),
  });
  assert.equal(result.text, "Klaar.");
  const continuation = seen[0]!;
  assert.deepEqual(continuation[0], history[0]);
  assert.equal((continuation[1] as { role: string }).role, "user");
  assert.ok(continuation.some((item) => (item as { type?: string }).type === "function_call_output"));
});

// ---------------------------------------------------------------------------
// Niveau 2 — security-paden + recorder/audit (tenantId/executionId)
// ---------------------------------------------------------------------------

test("router-regressie: website research ok → skill-record + tool-record met tenantId en executionId", async () => {
  const recorder = new MemoryRecorder();
  const execution = await executeLiveAssistantToolCall(
    researchCall({ url: "https://example.com" }),
    CONTEXT,
    makeLiveOptions(recorder, { ok: true, value: { title: "Example" } }),
  );
  assert.equal(execution.ok, true);
  assert.equal(execution.executionStatus, "SUCCEEDED");

  const skillRecord = recorder.records.find((r) => r.toolId === "skill:company.research");
  const toolRecord = recorder.records.find((r) => r.toolId === "assistant_website_research");
  assert.ok(skillRecord, "skill-record ontbreekt");
  assert.ok(toolRecord, "tool-record ontbreekt");
  for (const record of [skillRecord!, toolRecord!]) {
    assert.equal(record.tenantId, TENANT_A, "tenantId moet op het record staan");
    assert.ok(record.executionId.length > 0, "executionId moet op het record staan");
    assert.equal(record.status, "ALLOWED");
    assert.equal(record.agentId, "website_assistant");
  }
  // Tool-record is gecorreleerd aan de skill-execution.
  assert.ok(toolRecord!.executionId.startsWith(`${skillRecord!.executionId}:`));
  // Twee verschillende tenants → gescheiden records.
  const recorderB = new MemoryRecorder();
  await executeLiveAssistantToolCall(
    researchCall({ url: "https://example.com" }),
    { ...CONTEXT, tenantId: TENANT_B },
    makeLiveOptions(recorderB, { ok: true, value: { title: "Example" } }),
  );
  assert.ok(recorderB.records.every((r) => r.tenantId === TENANT_B));
});

test("router-regressie: missing tenant → TENANT_REQUIRED (NO TENANT = NO EXECUTION)", async () => {
  const recorder = new MemoryRecorder();
  const execution = await executeLiveAssistantToolCall(
    researchCall({ url: "https://example.com" }),
    { ...CONTEXT, tenantId: "   " },
    makeLiveOptions(recorder, { ok: true, value: {} }),
  );
  assert.equal(execution.ok, false);
  assert.equal(execution.error, "TENANT_REQUIRED");
  assert.equal(execution.executionStatus, "REJECTED");
  assert.ok(recorder.records.some((r) => r.errorCode === "TENANT_REQUIRED" && r.status === "DENIED"));
});

test("router-regressie: tool denied (policy) → POLICY_DENIED, géén uitvoering", async () => {
  const recorder = new MemoryRecorder();
  let executed = false;
  const execution = await executeLiveAssistantToolCall(
    researchCall({ url: "https://example.com" }),
    { ...CONTEXT, agentPermissions: [] }, // live agent zonder API_REQUEST
    {
      recorder,
      executors: {
        assistant_website_research: async () => {
          executed = true;
          return { ok: true, value: {} };
        },
      },
      log: () => {},
    },
  );
  assert.equal(execution.ok, false);
  assert.equal(execution.error, "POLICY_DENIED");
  assert.equal(executed, false);
  assert.ok(recorder.records.some((r) => r.errorCode === "POLICY_DENIED" && r.status === "DENIED"));
});

test("router-regressie: tool failure → EXECUTION_FAILED + ERROR-record (fail-closed code)", async () => {
  const recorder = new MemoryRecorder();
  const execution = await executeLiveAssistantToolCall(
    researchCall({ url: "https://example.com" }),
    CONTEXT,
    makeLiveOptions(recorder, { ok: false, error: "FETCH_TIMEOUT" }),
  );
  assert.equal(execution.ok, false);
  assert.equal(execution.error, "EXECUTION_FAILED");
  assert.equal(execution.executionStatus, "REJECTED");
  const toolRecord = recorder.records.find((r) => r.toolId === "assistant_website_research");
  assert.ok(toolRecord);
  assert.ok(["ERROR", "DENIED"].includes(toolRecord!.status));
});

test("router-regressie: unknown/unsupported tool-call → UNKNOWN_TOOL (fail-closed, geen skill-execution)", async () => {
  const recorder = new MemoryRecorder();
  const execution = await executeLiveAssistantToolCall(
    { callId: "call-9", name: "email_send", arguments: "{}" },
    CONTEXT,
    makeLiveOptions(recorder, { ok: true, value: {} }),
  );
  assert.equal(execution.ok, false);
  assert.equal(execution.error, "UNKNOWN_TOOL");
  assert.equal(execution.executionStatus, "REJECTED");
  assert.equal(recorder.records.length, 0); // geen uitvoering, geen records

  // Deterministische selectie blijft puur en fail-closed.
  assert.equal(selectLiveSkill({ name: "email_send", arguments: "{}" }), null);
  assert.deepEqual(selectLiveSkill({ name: "assistant_website_research", arguments: '{"url":"https://x.nl"}' }), {
    skillId: "company.research",
    input: { websiteUrl: "https://x.nl" },
  });
});

test("router-regressie: ongeldige tool-argumenten → INVALID_INPUT (schema, fail-closed)", async () => {
  const recorder = new MemoryRecorder();
  const noUrl = await executeLiveAssistantToolCall(
    researchCall({}),
    CONTEXT,
    makeLiveOptions(recorder, { ok: true, value: {} }),
  );
  assert.equal(noUrl.ok, false);
  assert.equal(noUrl.error, "INVALID_INPUT");
  assert.ok(recorder.records.some((r) => r.errorCode === "INVALID_INPUT"));

  const malformed = await executeLiveAssistantToolCall(
    { callId: "call-2", name: "assistant_website_research", arguments: "geen-json" },
    CONTEXT,
    makeLiveOptions(recorder, { ok: true, value: {} }),
  );
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error, "INVALID_INPUT");
});

test("recorder/audit: élke live tool-execution heeft tenantId + executionId + via de recorder", async () => {
  const recorder = new MemoryRecorder();
  await executeLiveAssistantToolCall(
    researchCall({ url: "https://example.com" }),
    CONTEXT,
    makeLiveOptions(recorder, { ok: true, value: { title: "A" } }),
  );
  await executeLiveAssistantToolCall(
    researchCall({ url: "https://other.nl" }),
    CONTEXT,
    makeLiveOptions(recorder, { ok: false, error: "boom" }),
  );
  assert.ok(recorder.records.length >= 4, "verwacht 2× skill + 2× tool records");
  const executionIds = new Set(recorder.records.map((r) => r.executionId));
  assert.equal(executionIds.size, recorder.records.length); // uniek per call
  for (const record of recorder.records) {
    assert.equal(record.tenantId, TENANT_A);
    assert.match(record.argumentsHash, /^[0-9a-f]{64}$/); // SHA-256, nooit ruwe args
  }
});

// ---------------------------------------------------------------------------
// Niveau 3 — route-guards + funnel (lead-funnel blijft werken)
// ---------------------------------------------------------------------------

test("route-guard: live route kent geen directe adapter-bypass meer (unified execution alleen)", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "app", "api", "assistant", "route.ts"), "utf8");
  assert.ok(route.includes("executeLiveAssistantToolCall"), "route moet de unified live execution gebruiken");
  assert.equal(route.includes("executeAssistantToolCall"), false, "directe adapter-bypass moet weg zijn");
  assert.equal(route.includes("runtime-adapter"), false, "geen directe runtime-adapter-import meer in de route");
  // Request-lagen blijven (BEFORE≈AFTER): rate limit + parsing + funnel.
  assert.ok(route.includes("rateLimiter.check"), "per-IP/sessie rate limit blijft in de route");
  assert.ok(route.includes("parseAssistantRequest"), "request-validatie blijft in de route");
  assert.ok(route.includes("maybeRunCustomerZeroOrchestration"), "Customer Zero funnel blijft gekoppeld");
  assert.ok(route.includes("getSiteTenantId"), "tenant-resolutie blijft centraal");
});

test("route-guard: invalid requests en rate limit blijven afgehandeld (bestaande lagen, geen wijziging)", async () => {
  const { parseAssistantRequest, MAX_BODY_BYTES } = await import("../lib/assistant/request.ts");
  const { RateLimiter } = await import("../lib/security/rate-limit.ts");

  const invalid = parseAssistantRequest({ sessionId: "x", message: "" });
  assert.equal(invalid.ok, false);
  assert.equal(MAX_BODY_BYTES > 0, true);

  const limiter = new RateLimiter({ limit: 1, windowMs: 60_000, now: () => 1_000_000 });
  assert.equal(limiter.check("ip:1.2.3.4").allowed, true);
  assert.equal(limiter.check("ip:1.2.3.4").allowed, false); // tweede hit binnen venster → DENY
});

test("funnel: lead-creatie roept runtime-task tenant-aware aan en notify krijgt tenantId", async () => {
  const calls: Array<{ conversationId: string; tenantId: string }> = [];
  const notified: Array<Record<string, unknown>> = [];
  const deps: FunnelDeps = {
    hasExistingLead: async () => false,
    runOrchestrator: async () => ({
      intent: { detected: true, level: "COMMERCIAL_INTENT", score: 6, reasons: [] },
      leadCreated: true,
      leadId: "lead-1",
    }),
    runRuntimeTask: async (conversationId, tenantId) => {
      calls.push({ conversationId, tenantId });
    },
    notifyLead: async (summary) => void notified.push({ ...summary }),
  };
  const outcome = await maybeRunCustomerZeroOrchestration(
    {
      tenantId: TENANT_A,
      conversationId: "11111111-1111-4111-8111-111111111111",
      messages: [{ role: "user", content: "Ik wil een afspraak." }],
    },
    deps,
  );
  assert.deepEqual(outcome, { ran: true, reason: "ran" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.tenantId, TENANT_A); // runtime-records tenant-correleerbaar
  assert.equal(notified.length, 1);
  assert.equal(notified[0]!.tenantId, TENANT_A);
});

test("recorder-writer: runtime-records (002) dragen tenantId als eerste waarde (Sprint 4-correlatie)", async () => {
  // Statische guard op de recorder-INSERTs: tenant_id eerste kolom.
  const recorderSource = readFileSync(
    join(import.meta.dirname, "..", "lib", "runtime", "postgres-run-recorder.ts"),
    "utf8",
  );
  for (const table of ["agent_runs", "runtime_tasks", "runtime_approvals", "runtime_executions", "runtime_evidence", "runtime_handoffs"]) {
    const insertStart = recorderSource.indexOf(`INSERT INTO ${table} (`);
    assert.ok(insertStart >= 0, `${table}: INSERT ontbreekt in de recorder`);
    const insertBlock = recorderSource.slice(insertStart, insertStart + 240);
    assert.ok(
      /\(\s*tenant_id,/.test(insertBlock),
      `${table}: tenant_id moet eerste kolom zijn (Sprint 4)`,
    );
  }
  assert.ok(recorderSource.includes("tenantId"), "entries moeten tenantId dragen");
});

test("employee: cross-tenant approve van een work-session is onmogelijk (zelfde fout als onbekend)", async () => {
  // Functioneel bewijs op repository-niveau: lookup per (tenant, session).
  const { getWorkSession, updateWorkSessionStatus } = await import(
    "../lib/autonomous-employee/work-session-repository.ts"
  );
  const rows: Array<{ tenant_id: string; session_id: string; status: string }> = [
    { tenant_id: TENANT_A, session_id: "sess-a", status: "WAITING_APPROVAL" },
  ];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("FROM employee_work_sessions")) {
      const row = rows.find((r) => r.tenant_id === values[0] && r.session_id === values[1]);
      return row ? [row] : [];
    }
    if (text.includes("UPDATE employee_work_sessions")) {
      const target = rows.find((r) => r.tenant_id === values[3] && r.session_id === values[4]);
      if (target) target.status = String(values[0]);
      return [];
    }
    return [];
  };
  const own = await getWorkSession(sql, TENANT_A, "sess-a");
  assert.equal(own?.status, "WAITING_APPROVAL");
  // Tenant B ziet de sessie van A niet — zelfde null-vorm als "bestaat niet".
  const foreign = await getWorkSession(sql, TENANT_B, "sess-a");
  assert.equal(foreign, null);
  // Update met B's tenant raakt A's sessie niet.
  await updateWorkSessionStatus(sql, TENANT_B, "sess-a", "COMPLETED", null);
  assert.equal(rows[0]!.status, "WAITING_APPROVAL");
});
