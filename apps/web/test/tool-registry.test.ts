import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createToolRegistryV2,
  ToolRegistryV2,
} from "../lib/tool-registry/registry.ts";
import {
  ASSISTANT_WEBSITE_RESEARCH,
  CALENDAR_CANCEL,
  CALENDAR_CREATE,
  CALENDAR_READ,
  CALENDAR_UPDATE,
  CONTACT_SEARCH,
  createDefaultToolRegistry,
  EMAIL_DRAFT,
  EMAIL_SEND,
  LEAD_READ,
  TOOL_SPECS,
} from "../lib/tool-registry/tools.ts";
import { assertValidToolSpec } from "../lib/tool-registry/validation.ts";
import type { ToolSpec } from "../lib/tool-registry/types.ts";

function validSpec(overrides: Partial<ToolSpec> = {}): ToolSpec {
  return { ...ASSISTANT_WEBSITE_RESEARCH, ...overrides };
}

test("registry: register/get/list/has met stabiele volgorde", () => {
  const registry = createToolRegistryV2([ASSISTANT_WEBSITE_RESEARCH, EMAIL_DRAFT, EMAIL_SEND]);
  assert.equal(registry.has("email_draft"), true);
  assert.equal(registry.get("email_send")?.riskLevel, "HIGH");
  assert.equal(registry.get("onbekend"), null);
  assert.deepEqual(
    registry.list().map((spec) => spec.id),
    ["assistant_website_research", "email_draft", "email_send"],
  );
});

test("registry: dubbele tool-id wordt geweigerd (fail-closed)", () => {
  const registry = createToolRegistryV2();
  registry.register(ASSISTANT_WEBSITE_RESEARCH);
  assert.throws(() => registry.register(ASSISTANT_WEBSITE_RESEARCH), /Duplicate tool id/);
});

test("registry: default catalogus bevat 18 tools, email_send disabled", () => {
  const registry = createDefaultToolRegistry();
  assert.equal(registry.list().length, 18);
  assert.equal(registry.isEnabled("email_send"), false);
  assert.equal(registry.isEnabled("email_draft"), true);
});

test("validation: ongeldige specs worden geweigerd", () => {
  assert.throws(() => assertValidToolSpec(validSpec({ id: "Ongeldig!Id" })), /INVALID_TOOL_SPEC/);
  assert.throws(() => assertValidToolSpec(validSpec({ id: "x" })), /INVALID_TOOL_SPEC/); // te kort
  assert.throws(() => assertValidToolSpec(validSpec({ name: "" })), /INVALID_TOOL_SPEC/);
  assert.throws(() => assertValidToolSpec(validSpec({ version: "1.0" })), /INVALID_TOOL_SPEC/);
  assert.throws(() => assertValidToolSpec(validSpec({ category: "ONBEKEND" as never })), /INVALID_TOOL_SPEC/);
  assert.throws(() => assertValidToolSpec(validSpec({ permissions: [] })), /INVALID_TOOL_SPEC/);
  assert.throws(() => assertValidToolSpec(validSpec({ class: "DELETE" as never })), /INVALID_TOOL_SPEC/);
  assert.throws(() => assertValidToolSpec(validSpec({ riskLevel: "EXTREME" as never })), /INVALID_TOOL_SPEC/);
  assert.throws(() => assertValidToolSpec(validSpec({ tenantPolicy: "MAYBE" as never })), /INVALID_TOOL_SPEC/);
  assert.throws(() => assertValidToolSpec(validSpec({ timeoutMs: 0 })), /INVALID_TOOL_SPEC/);
  assert.throws(() => assertValidToolSpec(validSpec({ rateLimit: { max: 0, windowMs: 1000 } })), /INVALID_TOOL_SPEC/);
  assert.throws(() => assertValidToolSpec(validSpec({ rateLimit: { max: 5, windowMs: -1 } })), /INVALID_TOOL_SPEC/);
  // Audit verplicht voor niet-READ tools (FASE 11).
  assert.throws(() => assertValidToolSpec(validSpec({ class: "WRITE", auditEnabled: false })), /INVALID_TOOL_SPEC/);
});

test("validation: geldige spec wordt geaccepteerd", () => {
  assert.equal(assertValidToolSpec(ASSISTANT_WEBSITE_RESEARCH), ASSISTANT_WEBSITE_RESEARCH);
  assert.equal(assertValidToolSpec(EMAIL_SEND), EMAIL_SEND);
});

test("isEnabled: fail-closed (onbekend, disabled, OFF)", () => {
  const registry = createDefaultToolRegistry();
  assert.equal(registry.isEnabled("onbekend"), false);
  assert.equal(registry.isEnabled("email_send"), false); // enabled: false
  const offSpec = validSpec({ id: "tool_off", tenantPolicy: "OFF" });
  const offRegistry = createToolRegistryV2([offSpec]);
  assert.equal(offRegistry.isEnabled("tool_off"), false); // OFF wint over enabled
  assert.equal(registry.isEnabled("contact_search", "tenant-1"), true); // tenantId-hook no-op vandaag
});

test("approvalRequired: risk HIGH/CRITICAL of tenantPolicy APPROVAL", () => {
  const registry = createDefaultToolRegistry();
  assert.equal(registry.approvalRequired("email_send"), true); // HIGH + APPROVAL
  assert.equal(registry.approvalRequired("calendar_read"), false); // LOW
  assert.equal(registry.approvalRequired("contact_search"), false); // MEDIUM zonder APPROVAL
  assert.equal(registry.approvalRequired("onbekend"), false);
  const forced = validSpec({ id: "tool_approval", requiresApproval: true, riskLevel: "MEDIUM" });
  assert.equal(createToolRegistryV2([forced]).approvalRequired("tool_approval"), true);
});

test("resolveAdapter: null = NOT_IMPLEMENTED (fail-closed)", () => {
  const registry = createDefaultToolRegistry();
  assert.equal(registry.resolveAdapter("email_send"), "email");
  assert.equal(registry.resolveAdapter("onbekend"), null);
  const noAdapter = validSpec({ id: "tool_no_adapter", adapter: null });
  assert.equal(createToolRegistryV2([noAdapter]).resolveAdapter("tool_no_adapter"), null);
});

test("toModelTools: alleen enabled tools, OpenAI-function shape", () => {
  const registry = createDefaultToolRegistry();
  const tools = registry.toModelTools(["assistant_website_research", "email_send", "onbekend"]);
  assert.deepEqual(
    tools.map((tool) => tool.function.name),
    ["assistant_website_research"], // email_send disabled + onbekend → uitgesloten
  );
  const tool = tools[0]!;
  assert.equal(tool.type, "function");
  assert.equal(typeof tool.function.description, "string");
  assert.deepEqual(tool.function.parameters, ASSISTANT_WEBSITE_RESEARCH.inputSchema);
});

test("catalogus: copy-ready specs zijn consistent met de design-docs", () => {
  assert.equal(TOOL_SPECS.length, 18);
  assert.equal(CALENDAR_READ.riskLevel, "LOW");
  assert.equal(EMAIL_DRAFT.permissions[0], "EMAIL_DRAFT");
  assert.equal(EMAIL_SEND.permissions[0], "EMAIL_SEND");
  assert.equal(CONTACT_SEARCH.permissions[0], "CRM_READ");
  assert.equal(LEAD_READ.permissions[0], "CRM_READ");
  assert.equal(CALENDAR_READ.permissions[0], "CALENDAR_READ");
  assert.equal(CALENDAR_CREATE.permissions[0], "CALENDAR_WRITE");
  assert.equal(CALENDAR_UPDATE.permissions[0], "CALENDAR_WRITE");
  assert.equal(CALENDAR_CANCEL.permissions[0], "CALENDAR_WRITE");
  assert.equal(CALENDAR_CANCEL.riskLevel, "HIGH"); // cancel = HIGH → approval altijd
  assert.equal(EMAIL_SEND.requiresApproval, true);
  assert.equal(EMAIL_SEND.tenantPolicy, "APPROVAL");
  assert.equal(CALENDAR_READ.rateLimit?.max, 60);
});

test("registry: fail-closed principes voor de gate-consumer", () => {
  const registry = createDefaultToolRegistry();
  // Gate-logica (later): enabled ∧ adapter ∧ permission — hier de bouwstenen.
  assert.equal(registry.isEnabled("email_send") && registry.resolveAdapter("email_send") !== null, false);
  assert.equal(registry.isEnabled("email_draft") && registry.resolveAdapter("email_draft") !== null, true);
  const registryInstance = new ToolRegistryV2();
  assert.equal(registryInstance.list().length, 0); // leeg = niets beschikbaar
});
