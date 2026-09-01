import assert from "node:assert/strict";
import { test } from "node:test";

import { discoverTools, normalizeIntent } from "../lib/tool-registry/discovery.ts";
import { createToolRegistryV2, type ToolRegistryV2 } from "../lib/tool-registry/registry.ts";
import { createDefaultToolRegistry } from "../lib/tool-registry/tools.ts";
import type { ToolSpec } from "../lib/tool-registry/types.ts";

const DEFAULT_REGISTRY: ToolRegistryV2 = createDefaultToolRegistry();

function customRegistry(specs: readonly ToolSpec[]): ToolRegistryV2 {
  return createToolRegistryV2(specs);
}

test("normalizeIntent: lowercase, tokens, stopwoorden eruit", () => {
  assert.deepEqual(normalizeIntent("Ik wil websites onderzoeken"), ["websites", "onderzoeken"]);
  assert.deepEqual(normalizeIntent("  Email  VERSTUREN! "), ["email", "versturen"]);
  assert.deepEqual(normalizeIntent("de het een en of"), []);
});

test("discovery: relevante intent vindt de juiste tool", () => {
  const result = discoverTools(
    { intent: "Ik wil websites onderzoeken", agentId: "assistant" },
    DEFAULT_REGISTRY,
  );
  assert.deepEqual(
    result.tools.map((tool) => tool.id),
    ["assistant_website_research"],
  );
  assert.deepEqual(result.matchedCategories, ["WEB"]);
  assert.equal(result.truncated, false);
});

test("discovery: irrelevante tools worden uitgesloten", () => {
  const result = discoverTools(
    { intent: "Ik wil websites onderzoeken", agentId: "assistant" },
    DEFAULT_REGISTRY,
  );
  for (const tool of result.tools) {
    assert.notEqual(tool.id, "email_draft");
    assert.notEqual(tool.id, "contact_search");
    assert.notEqual(tool.id, "calendar_read");
  }
});

test("discovery: disabled tools worden nooit aangeboden", () => {
  // email_send is disabled in de catalogus → alleen email_draft.
  const result = discoverTools(
    { intent: "email versturen", agentId: "employee" },
    DEFAULT_REGISTRY,
  );
  assert.deepEqual(
    result.tools.map((tool) => tool.id),
    ["email_draft"],
  );
});

test("discovery: onbekende intent → lege set (fail-closed, geen gok-tools)", () => {
  const result = discoverTools(
    { intent: "kostenberekening quantum computer", agentId: "assistant" },
    DEFAULT_REGISTRY,
  );
  assert.deepEqual(result.tools, []);
  assert.deepEqual(result.matchedCategories, []);
  assert.equal(result.truncated, false);
});

test("discovery: agent-permission-filter sluit tools uit zonder permission", () => {
  const result = discoverTools(
    { intent: "crm contact zoeken", agentId: "employee" },
    DEFAULT_REGISTRY,
    { allowedPermissions: ["CRM_READ"] },
  );
  const ids = result.tools.map((tool) => tool.id);
  assert.ok(ids.includes("contact_search"));
  assert.ok(ids.includes("lead_read"));
  assert.ok(!ids.includes("assistant_website_research")); // API_REQUEST ontbreekt
});

test("discovery: agent allowedTools-filter", () => {
  const result = discoverTools(
    { intent: "crm contact zoeken", agentId: "employee" },
    DEFAULT_REGISTRY,
    { allowedTools: ["contact_search"] },
  );
  assert.deepEqual(
    result.tools.map((tool) => tool.id),
    ["contact_search"],
  );
});

test("discovery: max_risk-filter (agent LOW ziet geen MEDIUM-tools)", () => {
  const result = discoverTools(
    { intent: "calendar agenda beschikbaarheid", agentId: "assistant" },
    DEFAULT_REGISTRY,
    { riskLevel: "LOW" },
  );
  assert.deepEqual(
    result.tools.map((tool) => tool.id),
    ["calendar_read"], // LOW; MEDIUM-tools (website/email/crm) zijn uitgesloten
  );
});

test("discovery: adapter-missing tools worden uitgesloten", () => {
  const registry = customRegistry([
    {
      id: "tool_no_adapter",
      name: "Zonder Adapter",
      description: "deze tool heeft geen adapter en mag nooit aangeboden worden",
      version: "1.0.0",
      category: "AI",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      permissions: ["MODEL_CALL"],
      class: "READ",
      riskLevel: "LOW",
      requiresApproval: false,
      enabled: true,
      adapter: null,
      tenantPolicy: "ON",
      auditEnabled: true,
      timeoutMs: 1000,
      rateLimit: null,
      keywords: ["no-adapter", "test"],
    },
  ]);
  const result = discoverTools({ intent: "no adapter test", agentId: "x" }, registry);
  assert.deepEqual(result.tools, []);
});

test("discovery: approval-vlag markeert HIGH-tools (markeer, verberg niet)", () => {
  const registry = customRegistry([
    {
      id: "github_write",
      name: "GitHub Write",
      description: "schrijf naar github",
      version: "1.0.0",
      category: "GITHUB",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      permissions: ["GITHUB_WRITE"],
      class: "WRITE",
      riskLevel: "HIGH",
      requiresApproval: true,
      enabled: true,
      adapter: "github",
      tenantPolicy: "APPROVAL",
      auditEnabled: true,
      timeoutMs: 5000,
      rateLimit: null,
      keywords: ["github", "write"],
    },
  ]);
  const result = discoverTools({ intent: "github write", agentId: "x" }, registry);
  assert.deepEqual(
    result.tools.map((tool) => tool.id),
    ["github_write"],
  );
  assert.deepEqual(result.approvalRequired, ["github_write"]);
});

test("discovery: limit + truncated", () => {
  // intent "crm" matcht twee tools (contact_search + lead_read via category).
  const unlimited = discoverTools({ intent: "crm", agentId: "x" }, DEFAULT_REGISTRY);
  assert.equal(unlimited.tools.length, 2);
  const result = discoverTools({ intent: "crm", agentId: "x", limit: 1 }, DEFAULT_REGISTRY);
  assert.equal(result.tools.length, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.tools[0]!.id, "contact_search"); // id asc bij gelijke score
});

test("discovery: categories-scope", () => {
  const result = discoverTools(
    { intent: "email versturen", agentId: "x", categories: ["CRM"] },
    DEFAULT_REGISTRY,
  );
  assert.deepEqual(result.tools, []);
});

test("discovery: determinisme (zelfde input → zelfde output)", () => {
  const input = { intent: "Ik wil websites onderzoeken", agentId: "assistant" };
  const first = discoverTools(input, DEFAULT_REGISTRY);
  const second = discoverTools(input, DEFAULT_REGISTRY);
  assert.deepEqual(second, first);
});

test("discovery: output bevat geen credentials/secrets", () => {
  const result = discoverTools(
    { intent: "email versturen", agentId: "x" },
    DEFAULT_REGISTRY,
  );
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("sk-"));
  assert.ok(!serialized.includes("api_key"));
  assert.ok(!serialized.includes("password"));
});
