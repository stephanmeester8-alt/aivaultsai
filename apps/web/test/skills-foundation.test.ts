import assert from "node:assert/strict";
import { test } from "node:test";

import { createDefaultToolRegistry } from "../lib/tool-registry/tools.ts";
import {
  approvalRequiredForRiskClass,
  isRiskClass,
  resolveAllowance,
  riskClassOfToolSpec,
  RISK_CLASS_LABELS,
} from "../lib/skills/risk.ts";
import { createSkillRegistry } from "../lib/skills/registry.ts";
import {
  assertTenantContext,
  TenantContextRequiredError,
  type AgentContext,
  type AgentSkill,
} from "../lib/skills/types.ts";

function makeSkill(overrides: Partial<AgentSkill> = {}): AgentSkill {
  return {
    id: "customer.inquiry",
    version: "1.0.0",
    description: "Beantwoord zakelijke vragen over AIVaultsAI.",
    inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
    outputSchema: { type: "object" },
    permissions: ["API_REQUEST"],
    allowedTools: [],
    riskClass: "R1",
    approvalPolicy: "AUTO",
    execute: async () => ({ ok: true, value: {} }),
    ...overrides,
  };
}

// ---- R0-R4-model ----

test("risk: R4 vereist altijd approval (NO EXCEPTIONS); R0-R3 niet op risico", () => {
  assert.equal(approvalRequiredForRiskClass("R4"), true);
  for (const riskClass of ["R0", "R1", "R2", "R3"] as const) {
    assert.equal(approvalRequiredForRiskClass(riskClass), false);
  }
  assert.equal(isRiskClass("R4"), true);
  assert.equal(isRiskClass("R5"), false);
  assert.equal(RISK_CLASS_LABELS.R4, "EXTERNAL/SENSITIVE");
});

test("risk: DENY beats ALLOW — elke weigering wint (fail-closed)", () => {
  assert.equal(resolveAllowance({ policyAllowed: true, tenantAllowed: true, enabled: true }), true);
  assert.equal(resolveAllowance({ policyAllowed: false, tenantAllowed: true, enabled: true }), false);
  assert.equal(resolveAllowance({ policyAllowed: true, tenantAllowed: false, enabled: true }), false);
  assert.equal(resolveAllowance({ policyAllowed: true, tenantAllowed: true, enabled: false }), false);
  assert.equal(resolveAllowance({ policyAllowed: false, tenantAllowed: false, enabled: false }), false);
});

// ---- R0-R4-afleiding uit de echte catalogus (BEFORE ≈ AFTER) ----

test("risk: risicoklasse-afleiding over alle 18 ToolSpecs is consistent met approval-gedrag", () => {
  const registry = createDefaultToolRegistry();
  const specs = registry.list();
  assert.equal(specs.length, 18);

  const r4: string[] = [];
  for (const spec of specs) {
    const riskClass = riskClassOfToolSpec(spec);
    const approval = registry.approvalRequired(spec.id);
    if (riskClass === "R4") r4.push(spec.id);
    // Invariant 1: R4 ⇒ approval verplicht (bestaand gedrag bevestigt dat).
    if (riskClass === "R4") assert.equal(approval, true, `${spec.id} is R4 maar approvalRequired=false`);
    // Invariant 2: zonder approval-policy nooit R4 (geen stille R4).
    if (!approval) assert.notEqual(riskClass, "R4", `${spec.id} heeft geen approval maar is R4`);
  }
  // Externe/sensitieve acties zijn precies email_send en calendar_cancel.
  assert.deepEqual(r4.sort(), ["calendar_cancel", "email_send"]);
});

test("risk: spotchecks van de afleiding per tool", () => {
  const registry = createDefaultToolRegistry();
  const of = (id: string) => riskClassOfToolSpec(registry.get(id)!);
  assert.equal(of("email_send"), "R4"); // externe side effect
  assert.equal(of("calendar_cancel"), "R4"); // definitieve write, HIGH
  assert.equal(of("contact_create"), "R3"); // business write (policy-approval)
  assert.equal(of("email_draft"), "R2"); // draft
  assert.equal(of("employee_database_write"), "R2"); // interne opslag
  assert.equal(of("calendar_read"), "R0"); // eenvoudig lezen
  assert.equal(of("employee_discovery"), "R0");
  assert.equal(of("contact_search"), "R1"); // lezen+interpreteren (MEDIUM)
  assert.equal(of("assistant_website_research"), "R1");
});

// ---- NO TENANT = NO EXECUTION ----

test("tenant: executie zonder tenantId → TenantContextRequiredError", () => {
  assert.throws(() => assertTenantContext({ tenantId: "" }), TenantContextRequiredError);
  assert.throws(() => assertTenantContext({ tenantId: "   " }), TenantContextRequiredError);
  assert.throws(() => assertTenantContext({ tenantId: "" as string }), /NO TENANT = NO EXECUTION/);
  const valid: AgentContext = { tenantId: "11111111-1111-4111-8111-111111111111" };
  assertTenantContext(valid); // geen throw
});

// ---- SkillRegistry ----

test("skills: registratie + lookup + stabiele volgorde", async () => {
  const registry = createSkillRegistry();
  const inquiry = makeSkill();
  const research = makeSkill({ id: "company.research", description: "Onderzoek een bedrijf." });
  registry.register(inquiry);
  registry.register(research);

  assert.equal(registry.list().length, 2);
  assert.equal(registry.list()[0]!.id, "customer.inquiry");
  assert.equal(registry.has("company.research"), true);
  assert.equal(registry.get("customer.inquiry")?.version, "1.0.0");
  assert.equal(registry.get("onbekend.skill"), null);

  const result = await registry.get("company.research")!.execute(
    { tenantId: "11111111-1111-4111-8111-111111111111" },
    {},
  );
  assert.equal(result.ok, true);
});

test("skills: dubbele id en ongeldige contracten worden geweigerd (fail-closed)", () => {
  const registry = createSkillRegistry();
  registry.register(makeSkill());
  assert.throws(() => registry.register(makeSkill()), /Duplicate skill id/);

  assert.throws(() => createSkillRegistry([makeSkill({ id: "Ongeldig!" })]), /INVALID_SKILL/);
  assert.throws(() => createSkillRegistry([makeSkill({ version: "1.0" })]), /INVALID_SKILL/);
  assert.throws(() => createSkillRegistry([makeSkill({ description: "" })]), /INVALID_SKILL/);
  assert.throws(
    () => createSkillRegistry([makeSkill({ riskClass: "R9" as never })]),
    /INVALID_SKILL/,
  );
  assert.throws(
    () => createSkillRegistry([makeSkill({ approvalPolicy: "ALWAYS" as never })]),
    /INVALID_SKILL/,
  );
  assert.throws(
    () => createSkillRegistry([makeSkill({ execute: undefined as never })]),
    /INVALID_SKILL/,
  );
});

test("skills: invariant R4 ⇒ approvalPolicy REQUIRED wordt afgedwongen", () => {
  // R4 met AUTO → registratie-fout (nooit een stille R4 zonder approval).
  assert.throws(
    () => createSkillRegistry([makeSkill({ riskClass: "R4", approvalPolicy: "AUTO" })]),
    /riskClass R4 requires approvalPolicy "REQUIRED"/,
  );
  assert.throws(
    () => createSkillRegistry([makeSkill({ riskClass: "R4", approvalPolicy: "POLICY" })]),
    /INVALID_SKILL/,
  );
  // R4 met REQUIRED → geldig.
  const registry = createSkillRegistry([
    makeSkill({ id: "email.send", riskClass: "R4", approvalPolicy: "REQUIRED" }),
  ]);
  assert.equal(registry.has("email.send"), true);
});
