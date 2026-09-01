import assert from "node:assert/strict";
import { test } from "node:test";

import { executeEmployeeTool } from "../lib/autonomous-employee/registry-adapter.ts";
import type { EmployeeToolContext } from "../lib/autonomous-employee/types.ts";
import { discoverTools } from "../lib/tool-registry/discovery.ts";
import { createDefaultToolRegistry, EMPLOYEE_AGENT, EMPLOYEE_ALLOWED_TOOLS } from "../lib/tool-registry/tools.ts";

const REGISTRY = createDefaultToolRegistry();

function makeContext(overrides: Partial<EmployeeToolContext> = {}): EmployeeToolContext {
  return {
    tenantId: "11111111-1111-1111-1111-111111111111",
    sql: async () => [],
    fetchImpl: async () =>
      new Response(
        "<html><head><title>Acme BV</title></head><body><h1>Acme</h1><p>AI voor installatiebedrijven</p></body></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      ) as Response,
    lookup: async () => ["93.184.216.34"],
    now: () => "2026-09-01T08:00:00.000Z",
    log: () => {},
    ...overrides,
  };
}

test("registry: employee-ToolSpecs aanwezig met TASK 15-metadata", () => {
  for (const id of ["employee_discovery", "employee_website_research", "employee_qualify", "employee_database_read", "employee_database_write"]) {
    const spec = REGISTRY.get(id);
    assert.ok(spec, `${id} moet in de registry zitten`);
    assert.equal(REGISTRY.isEnabled(id), true);
  }
  assert.equal(REGISTRY.get("employee_website_research")?.riskLevel, "MEDIUM");
  assert.equal(REGISTRY.get("employee_website_research")?.permissions[0], "API_REQUEST");
  assert.equal(REGISTRY.get("employee_discovery")?.riskLevel, "LOW");
  assert.equal(REGISTRY.get("employee_discovery")?.permissions[0], "DATABASE_READ");
  assert.equal(REGISTRY.get("employee_database_write")?.class, "WRITE");
  assert.equal(REGISTRY.get("employee_database_write")?.permissions[0], "DATABASE_WRITE");
});

test("employee-agent: allowedTools zonder email_send (dubbel slot)", () => {
  assert.equal(EMPLOYEE_ALLOWED_TOOLS.length, 6);
  assert.ok(EMPLOYEE_ALLOWED_TOOLS.includes("employee_discovery"));
  assert.ok(EMPLOYEE_ALLOWED_TOOLS.includes("email_draft"));
  assert.ok(!EMPLOYEE_ALLOWED_TOOLS.includes("email_send"));
  assert.equal(EMPLOYEE_AGENT.riskLevel, "MEDIUM");
  assert.ok(!EMPLOYEE_AGENT.allowedPermissions?.includes("EMAIL_SEND"));
});

test("executeEmployeeTool: onbekende tool → DENY (fail-closed)", async () => {
  const result = await executeEmployeeTool("bestaande_niet", {}, makeContext(), REGISTRY);
  assert.equal(result.ok, false);
  assert.equal(result.error, "UNKNOWN_TOOL");
  assert.equal(result.policy.allowed, false);
});

test("executeEmployeeTool: disabled tool → DENY (email_send is default uit)", async () => {
  const result = await executeEmployeeTool("email_send", { draftId: "x", approvalId: "y" }, makeContext(), REGISTRY);
  assert.equal(result.ok, false);
  assert.equal(result.error, "TOOL_DISABLED");
  assert.equal(result.policy.allowed, false);
});

test("executeEmployeeTool: bekende tool zonder gebonden handler → NOT_IMPLEMENTED", async () => {
  const result = await executeEmployeeTool("employee_database_read", { domain: "acme.nl" }, makeContext(), REGISTRY);
  assert.equal(result.ok, false);
  assert.equal(result.error, "NOT_IMPLEMENTED");
  assert.equal(result.policy.reason, "ADAPTER_NOT_BOUND");
});

test("executeEmployeeTool: employee_discovery (valide, pure)", async () => {
  const result = await executeEmployeeTool(
    "employee_discovery",
    {
      companies: [
        { name: "Acme BV", websiteUrl: "https://acme.nl" },
        { name: "Acme BV", websiteUrl: "https://acme.nl" }, // duplicate
        { name: "Beta BV", websiteUrl: "https://beta.nl" },
      ],
      limit: 5,
    },
    makeContext(),
    REGISTRY,
  );
  assert.equal(result.ok, true);
  assert.equal(result.policy.allowed, true);
  const value = result.value as { companies: unknown[] };
  assert.equal(value.companies.length, 2); // dedupe
});

test("executeEmployeeTool: employee_website_research met fake fetch → ok", async () => {
  const result = await executeEmployeeTool(
    "employee_website_research",
    { websiteUrl: "https://acme.nl", domain: "acme.nl" },
    makeContext(),
    REGISTRY,
  );
  assert.equal(result.ok, true);
  const value = result.value as { research: { status: string } };
  assert.equal(value.research.status, "ok");
});

test("executeEmployeeTool: ongeldige input → gecontroleerde fout (geen retry)", async () => {
  const result = await executeEmployeeTool(
    "employee_discovery",
    { companies: "geen-array" },
    makeContext(),
    REGISTRY,
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "INVALID_DISCOVER_INPUT");
  assert.equal(result.policy.allowed, false);
});

test("discovery: employee-agent ziet alleen zijn allowedTools (TASK 15 §4)", () => {
  const result = discoverTools(
    { intent: "onderzoek", agentId: "autonomous-employee" },
    REGISTRY,
    EMPLOYEE_AGENT,
  );
  const ids = result.tools.map((tool) => tool.id);
  assert.deepEqual(ids, ["employee_website_research"]); // assistant_website_research buiten allowedTools
  for (const id of ids) {
    assert.ok(EMPLOYEE_ALLOWED_TOOLS.includes(id), `${id} moet in allowedTools staan`);
  }
  assert.ok(!ids.includes("email_send"));
});
