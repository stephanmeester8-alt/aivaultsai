import assert from "node:assert/strict";
import { test } from "node:test";

import { createApprovalGate, type ApprovalSnapshot } from "../lib/approvals/approval-gate.ts";
import type { MetricRecorder, ToolCallRecord } from "../lib/observability/metrics.ts";
import { createToolRegistryV2 } from "../lib/tool-registry/registry.ts";
import { TOOL_SPECS } from "../lib/tool-registry/tools.ts";
import {
  createCompanyResearchSkill,
  createCustomerInquirySkill,
  createLeadCaptureSkill,
} from "../lib/skills/definitions.ts";
import { createSkillRegistry } from "../lib/skills/registry.ts";
import { executeSkill } from "../lib/skills/router.ts";
import type { AgentSkill } from "../lib/skills/types.ts";
import type { LeadsSql } from "../lib/leads/repository.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";

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

function makeLeadsSql() {
  const inserts: Array<Record<string, unknown>> = [];
  const sql: LeadsSql = async (strings, ...values) => {
    const text = strings.join("?");
    if (text.includes("INSERT INTO contact_leads")) {
      inserts.push({
        name: values[0],
        email: values[1],
        service: values[4],
        status: values[6],
        source: values[7],
      });
      return [{ lead_id: "lead-1", created_at: "2026-09-02T08:00:00.000Z" }];
    }
    return [];
  };
  return { sql, inserts };
}

function approvedSnapshot(requestedAction: string): ApprovalSnapshot {
  return { status: "APPROVED", requestedAction, expiresAt: null };
}

function makeGatewayProbeSkill(overrides: Partial<AgentSkill> = {}): AgentSkill {
  return {
    id: "probe.tool",
    version: "1.0.0",
    description: "Test-skill die één tool via de gateway aanroept.",
    inputSchema: {
      type: "object",
      properties: { toolId: { type: "string", minLength: 1 } },
      required: ["toolId"],
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    permissions: ["API_REQUEST"],
    allowedTools: ["assistant_website_research"],
    riskClass: "R1",
    approvalPolicy: "AUTO",
    async execute(context, input) {
      const { toolId } = input as { toolId: string };
      const result = await context.tools!.execute(toolId, { url: "https://example.com" });
      return result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error! };
    },
    ...overrides,
  };
}

function baseContext(overrides: Partial<Parameters<typeof executeSkill>[1]["context"]> = {}) {
  return { tenantId: TENANT, agentPermissions: ["API_REQUEST", "DATABASE_WRITE", "CRM_WRITE", "EMAIL_SEND"], ...overrides };
}

function makeRouter() {
  const { sql, inserts } = makeLeadsSql();
  const recorder = new MemoryRecorder();
  let researchCalls = 0;
  const skills = createSkillRegistry([
    createCustomerInquirySkill(),
    createCompanyResearchSkill(),
    createLeadCaptureSkill({ sql, notifier: null }),
  ]);
  const tools = createToolRegistryV2(TOOL_SPECS);
  const executors = {
    assistant_website_research: async (input: unknown) => {
      researchCalls += 1;
      const { url } = input as { url: string };
      return { ok: true, value: { url, title: "Example", summary: "ok" } };
    },
  };
  const deps = {
    skills,
    tools,
    executors,
    recorder,
    approvalGate: createApprovalGate(async () => null),
    now: () => "2026-09-02T08:00:00.000Z",
    log: () => {},
  };
  return { deps, recorder, inserts, skills, researchCalls: () => researchCalls };
}

// ---- skills werken ----

test("router: customer.inquiry werkt zonder externe write (alleen analyse)", async () => {
  const { deps, recorder, researchCalls } = makeRouter();
  const outcome = await executeSkill(deps, {
    skillId: "customer.inquiry",
    input: { question: "Ik wil een demo aanvragen voor mijn bedrijf." },
    context: baseContext(),
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    const value = outcome.value as { level: string; nextBestAction: string };
    assert.equal(value.level, "HIGH_COMMERCIAL_INTENT");
    assert.equal(value.nextBestAction, "lead_capture");
  }
  assert.equal(researchCalls(), 0); // geen tool, geen write
  assert.ok(recorder.records.some((r) => r.toolId === "skill:customer.inquiry" && r.status === "ALLOWED"));
});

test("router: company.research gebruikt alleen de toegestane read-tool", async () => {
  const { deps, recorder } = makeRouter();
  const outcome = await executeSkill(deps, {
    skillId: "company.research",
    input: { websiteUrl: "https://example.com" },
    context: baseContext(),
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal((outcome.value as { title: string }).title, "Example");
  }
  // Skill-record + tool-record beide aanwezig.
  assert.ok(recorder.records.some((r) => r.toolId === "skill:company.research"));
  assert.ok(recorder.records.some((r) => r.toolId === "assistant_website_research" && r.status === "ALLOWED"));
});

test("router: lead.capture schrijft via de pipeline naar de bestaande lead-opslag", async () => {
  const { deps, recorder, inserts } = makeRouter();
  const outcome = await executeSkill(deps, {
    skillId: "lead.capture",
    input: {
      name: "Jan Jansen",
      email: "Jan@Acme.NL",
      service: "ai-assistent",
      message: "Wij willen een AI-assistent.",
    },
    context: baseContext(),
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal((outcome.value as { leadId: string | null }).leadId, "lead-1");
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0]!.email, "jan@acme.nl"); // genormaliseerd
  assert.equal(inserts[0]!.status, "new");
  assert.ok(recorder.records.some((r) => r.toolId === "skill:lead.capture" && r.status === "ALLOWED"));
});

// ---- fail-closed keten ----

test("router: missing tenant → TENANT_REQUIRED (NO TENANT = NO EXECUTION)", async () => {
  const { deps, recorder } = makeRouter();
  const outcome = await executeSkill(deps, {
    skillId: "customer.inquiry",
    input: { question: "Hallo" },
    context: baseContext({ tenantId: "  " }),
  });
  assert.deepEqual(outcome, { ok: false, executionId: outcome.executionId, error: "TENANT_REQUIRED" });
  assert.ok(recorder.records.some((r) => r.errorCode === "TENANT_REQUIRED" && r.status === "DENIED"));
});

test("router: unknown skill → UNKNOWN_SKILL (fail closed)", async () => {
  const { deps, recorder } = makeRouter();
  const outcome = await executeSkill(deps, {
    skillId: "bestaand.niet",
    input: {},
    context: baseContext(),
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error, "UNKNOWN_SKILL");
  assert.ok(recorder.records.some((r) => r.errorCode === "UNKNOWN_SKILL"));
});

test("router: ongeldige input (schema + email) → INVALID_INPUT", async () => {
  const { deps } = makeRouter();
  const schemaViolation = await executeSkill(deps, {
    skillId: "company.research",
    input: { websiteUrl: "https://example.com", extra: 1 },
    context: baseContext(),
  });
  assert.equal(schemaViolation.ok, false);
  if (!schemaViolation.ok) assert.equal(schemaViolation.error, "INVALID_INPUT");

  const missingQuestion = await executeSkill(deps, {
    skillId: "customer.inquiry",
    input: {},
    context: baseContext(),
  });
  assert.equal(missingQuestion.ok, false);
  if (!missingQuestion.ok) assert.equal(missingQuestion.error, "INVALID_INPUT");

  const badEmail = await executeSkill(deps, {
    skillId: "lead.capture",
    input: { name: "Jan", email: "geen-mail", service: "anders", message: "Hallo" },
    context: baseContext(),
  });
  assert.equal(badEmail.ok, false);
  if (!badEmail.ok) assert.equal(badEmail.error, "INVALID_INPUT");
});

test("router: policy — skill.permissions zonder agent-toestemming → POLICY_DENIED", async () => {
  const { deps, recorder } = makeRouter();
  const outcome = await executeSkill(deps, {
    skillId: "lead.capture",
    input: { name: "Jan", email: "jan@acme.nl", service: "anders", message: "Hallo" },
    context: baseContext({ agentPermissions: ["API_REQUEST"] }), // zonder DATABASE_WRITE
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error, "POLICY_DENIED");
  assert.ok(recorder.records.some((r) => r.errorCode === "POLICY_DENIED"));
});

test("router: R4 zonder approval → APPROVAL_REQUIRED; met APPROVED approval → ok", async () => {
  const { deps, recorder, skills } = makeRouter();
  const r4Skill = makeGatewayProbeSkill({
    id: "probe.r4",
    riskClass: "R4",
    approvalPolicy: "REQUIRED",
    allowedTools: ["email_send"], // R4-tool; spec disabled → later in de tool-check
    permissions: ["EMAIL_SEND"],
  });
  skills.register(r4Skill);

  // Zonder gate → APPROVAL_REQUIRED (fail-closed).
  const noGate = await executeSkill({ ...deps, approvalGate: null }, {
    skillId: "probe.r4",
    input: { toolId: "email_send" },
    context: baseContext(),
  });
  assert.equal(noGate.ok, false);
  if (!noGate.ok) assert.equal(noGate.error, "APPROVAL_REQUIRED");

  // Gate zonder approval-record → APPROVAL_REQUIRED.
  const notApproved = await executeSkill(deps, {
    skillId: "probe.r4",
    input: { toolId: "email_send" },
    context: baseContext(),
  });
  assert.equal(notApproved.ok, false);
  if (!notApproved.ok) assert.equal(notApproved.error, "APPROVAL_REQUIRED");

  // Goedgekeurde approval → skill mag draaien (tool-check volgt daarna).
  const approvedGate = createApprovalGate(async (id) =>
    id === "apr-1" ? approvedSnapshot("skill:probe.r4") : null,
  );
  const approved = await executeSkill(
    { ...deps, approvalGate: approvedGate },
    {
      skillId: "probe.r4",
      input: { toolId: "email_send" },
      context: baseContext({ approvalId: "apr-1" }),
    },
  );
  // email_send is disabled in de catalogus → de gateway blokkeert ná approval.
  assert.equal(approved.ok, false);
  if (!approved.ok) assert.equal(approved.error, "TOOL_DISABLED");
  assert.ok(recorder.records.some((r) => r.errorCode === "APPROVAL_REQUIRED"));
});

test("router: gateway — tool niet toegestaan voor skill → TOOL_NOT_ALLOWED", async () => {
  const { deps, skills } = makeRouter();
  const probe = makeGatewayProbeSkill({ allowedTools: ["assistant_website_research"] });
  skills.register(probe);
  const outcome = await executeSkill(deps, {
    skillId: "probe.tool",
    input: { toolId: "contact_search" }, // niet in allowedTools
    context: baseContext(),
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error, "TOOL_NOT_ALLOWED");
});

test("router: gateway — unknown tool → TOOL_UNKNOWN; disabled tool → TOOL_DISABLED", async () => {
  const { deps, skills } = makeRouter();
  skills.register(makeGatewayProbeSkill({ id: "probe.unknown", allowedTools: ["bestaand_niet"] }));
  const unknown = await executeSkill(deps, {
    skillId: "probe.unknown",
    input: { toolId: "bestaand_niet" },
    context: baseContext(),
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.error, "TOOL_UNKNOWN");

  skills.register(
    makeGatewayProbeSkill({
      id: "probe.disabled",
      allowedTools: ["email_send"],
      permissions: ["EMAIL_SEND"],
    }),
  );
  const disabled = await executeSkill(deps, {
    skillId: "probe.disabled",
    input: { toolId: "email_send" }, // spec.enabled = false (fail-closed default)
    context: baseContext(),
  });
  assert.equal(disabled.ok, false);
  if (!disabled.ok) assert.equal(disabled.error, "TOOL_DISABLED");
});

test("router: gateway — tool zonder gebonden executor → TOOL_NOT_IMPLEMENTED", async () => {
  const { deps, skills } = makeRouter();
  skills.register(
    makeGatewayProbeSkill({
      id: "probe.noexec",
      allowedTools: ["contact_search"],
      permissions: ["CRM_READ"],
    }),
  );
  // contact_search bestaat + enabled, maar er is geen executor gebonden.
  const outcome = await executeSkill(deps, {
    skillId: "probe.noexec",
    input: { toolId: "contact_search" },
    context: baseContext({ agentPermissions: ["API_REQUEST", "DATABASE_WRITE", "CRM_WRITE", "EMAIL_SEND", "CRM_READ"] }),
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error, "TOOL_NOT_IMPLEMENTED");
});

test("router: gateway — R3-tool zonder skill-approval → TOOL_APPROVAL_REQUIRED", async () => {
  const { deps, skills } = makeRouter();
  // contact_create: WRITE/MEDIUM met spec-approval (approvalRequired true).
  skills.register(
    makeGatewayProbeSkill({
      id: "probe.r3tool",
      allowedTools: ["contact_create"],
      permissions: ["CRM_WRITE"],
    }),
  );
  // Executor aanwezig, zodat de approval-check de eerste failing check is.
  const withExecutor = {
    ...deps,
    executors: { ...deps.executors, contact_create: async () => ({ ok: true, value: {} }) },
  };
  const outcome = await executeSkill(withExecutor, {
    skillId: "probe.r3tool",
    input: { toolId: "contact_create" },
    context: baseContext(),
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.error, "TOOL_APPROVAL_REQUIRED");
});

test("router: recorder wordt bij élke uitkomst aangeroepen (ook DENY)", async () => {
  const { deps, recorder } = makeRouter();
  const cases = [
    { skillId: "bestaand.niet", input: {}, context: baseContext() },
    { skillId: "customer.inquiry", input: {}, context: baseContext() },
    { skillId: "lead.capture", input: { name: "x", email: "x@x.nl", service: "anders", message: "m" }, context: baseContext({ tenantId: "" }) },
  ];
  for (const request of cases) {
    await executeSkill(deps, request as never);
  }
  const denied = recorder.records.filter((r) => r.status === "DENIED");
  assert.ok(denied.length >= 3, `verwacht ≥3 DENIED-records, kreeg ${denied.length}`);
});

test("router: executionId is uniek per run en aanwezig in elke uitkomst", async () => {
  const { deps } = makeRouter();
  const first = await executeSkill(deps, {
    skillId: "customer.inquiry",
    input: { question: "Hallo" },
    context: baseContext(),
  });
  const second = await executeSkill(deps, {
    skillId: "customer.inquiry",
    input: { question: "Hallo" },
    context: baseContext(),
  });
  assert.ok(first.executionId.length > 0);
  assert.notEqual(first.executionId, second.executionId);
  const denied = await executeSkill(deps, { skillId: "onbekend.skill", input: {}, context: baseContext() });
  assert.ok(denied.executionId.length > 0);
});
