import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertValidBudget,
  DEFAULT_EMPLOYEE_BUDGET,
  EmployeeBudgetTracker,
} from "../lib/autonomous-employee/budget.ts";
import { executeEmployeeTool } from "../lib/autonomous-employee/registry-adapter.ts";
import { createDefaultToolRegistry } from "../lib/tool-registry/tools.ts";
import type { EmployeeToolContext } from "../lib/autonomous-employee/types.ts";

const REGISTRY = createDefaultToolRegistry();
const TENANT_ID = "11111111-1111-1111-1111-111111111111";

function makeContext(overrides: Partial<EmployeeToolContext> = {}): EmployeeToolContext {
  return {
    tenantId: TENANT_ID,
    sql: async () => [],
    now: () => "2026-09-01T08:00:00.000Z",
    log: () => {},
    ...overrides,
  };
}

test("budget: defaults toegepast wanneer budget ontbreekt", () => {
  const tracker = new EmployeeBudgetTracker();
  assert.equal(tracker.check().ok, true);
  assert.equal(tracker.snapshot().steps, 0);
  assert.equal(tracker.snapshot().toolCalls, 0);
  assert.equal(tracker.snapshot().networkRequests, 0);
  assert.equal(tracker.snapshot().runtimeMs, 0);
});

test("budget: ongeldig budget → INVALID_BUDGET (fail-closed)", () => {
  assert.throws(() => assertValidBudget({ ...DEFAULT_EMPLOYEE_BUDGET, maxToolCalls: 0 }), /INVALID_BUDGET/);
  assert.throws(() => assertValidBudget({ ...DEFAULT_EMPLOYEE_BUDGET, maxSteps: -1 }), /INVALID_BUDGET/);
  assert.throws(
    () => assertValidBudget({ ...DEFAULT_EMPLOYEE_BUDGET, maxRuntimeMs: 1.5 }),
    /INVALID_BUDGET/,
  );
  assert.throws(
    () => assertValidBudget({ ...DEFAULT_EMPLOYEE_BUDGET, deadline: "geen-datum" }),
    /INVALID_BUDGET/,
  );
});

test("budget: maxToolCalls bereikt → BUDGET_EXCEEDED", () => {
  const tracker = new EmployeeBudgetTracker({ ...DEFAULT_EMPLOYEE_BUDGET, maxToolCalls: 2 });
  assert.equal(tracker.check().ok, true);
  tracker.recordToolCall("a");
  tracker.recordToolCall("b");
  const check = tracker.check();
  assert.equal(check.ok, false);
  if (!check.ok) {
    assert.equal(check.field, "toolCalls");
    assert.equal(check.used, 2);
    assert.equal(check.limit, 2);
  }
  assert.equal(tracker.snapshot().exceeded?.field, "toolCalls");
});

test("budget: maxSteps bereikt → BUDGET_EXCEEDED", () => {
  const tracker = new EmployeeBudgetTracker({ ...DEFAULT_EMPLOYEE_BUDGET, maxSteps: 1 });
  tracker.recordStep();
  const check = tracker.check();
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.field, "steps");
});

test("budget: maxNetworkRequests bereikt → BUDGET_EXCEEDED", () => {
  const tracker = new EmployeeBudgetTracker({ ...DEFAULT_EMPLOYEE_BUDGET, maxNetworkRequests: 1 });
  tracker.recordNetworkRequest();
  const check = tracker.check();
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.field, "networkRequests");
});

test("budget: maxRuntimeMs bereikt (injectable now) → BUDGET_EXCEEDED", () => {
  let nowValue = "2026-09-01T08:00:00.000Z";
  const tracker = new EmployeeBudgetTracker(
    { ...DEFAULT_EMPLOYEE_BUDGET, maxRuntimeMs: 1_000 },
    () => nowValue,
  );
  tracker.recordToolCall("a"); // start klok
  nowValue = "2026-09-01T08:00:02.000Z"; // +2s > 1s
  const check = tracker.check();
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.field, "runtimeMs");
  assert.equal(tracker.snapshot().runtimeMs, 2_000);
});

test("budget: deadline verstreken → BUDGET_EXCEEDED", () => {
  const tracker = new EmployeeBudgetTracker({
    ...DEFAULT_EMPLOYEE_BUDGET,
    deadline: "2026-09-01T07:59:59.000Z", // vóór now()
  });
  const check = tracker.check();
  assert.equal(check.ok, false);
  if (!check.ok) assert.equal(check.field, "deadline");
});

test("budget: klok start bij eerste tool-call; runtime 0 vóór start", () => {
  const tracker = new EmployeeBudgetTracker({ ...DEFAULT_EMPLOYEE_BUDGET });
  assert.equal(tracker.snapshot().startedAt, null);
  assert.equal(tracker.snapshot().runtimeMs, 0);
  tracker.recordToolCall("a");
  assert.ok(tracker.snapshot().startedAt);
  tracker.recordToolCall("b");
  const usage = tracker.finish();
  assert.ok(usage.finishedAt);
  assert.equal(usage.toolCalls, 2);
});

test("budget: usage-snapshot bevat alleen tellers (geen secrets)", () => {
  const tracker = new EmployeeBudgetTracker();
  tracker.recordToolCall("email_draft");
  const serialized = JSON.stringify(tracker.snapshot());
  assert.ok(!serialized.includes("sk-"));
  assert.ok(!serialized.includes("password"));
});

test("adapter-integratie: budget op → call geweigerd vóór de gate", async () => {
  const tracker = new EmployeeBudgetTracker({ ...DEFAULT_EMPLOYEE_BUDGET, maxToolCalls: 1 });
  const ctx = makeContext();
  const first = await executeEmployeeTool(
    "employee_discovery",
    { companies: [{ name: "Acme", websiteUrl: "https://acme.nl" }], limit: 5 },
    ctx,
    REGISTRY,
    tracker,
  );
  assert.equal(first.ok, true);
  assert.equal(tracker.snapshot().toolCalls, 1);
  const second = await executeEmployeeTool("employee_discovery", { companies: [] }, ctx, REGISTRY, tracker);
  assert.equal(second.ok, false);
  assert.equal(second.error, "BUDGET_EXCEEDED");
  assert.equal(second.policy.reason, "BUDGET_EXCEEDED:toolCalls");
});

test("adapter-integratie: DENY'd pogingen tellen mee (anti-loop)", async () => {
  const tracker = new EmployeeBudgetTracker({ ...DEFAULT_EMPLOYEE_BUDGET, maxToolCalls: 2 });
  const ctx = makeContext();
  // Ongeldige input → handler DENY, maar de poging telt.
  const denied = await executeEmployeeTool("employee_discovery", { companies: "geen-array" }, ctx, REGISTRY, tracker);
  assert.equal(denied.ok, false);
  assert.equal(denied.error, "INVALID_DISCOVER_INPUT");
  assert.equal(tracker.snapshot().toolCalls, 1);
  const second = await executeEmployeeTool(
    "employee_discovery",
    { companies: [{ name: "Acme", websiteUrl: "https://acme.nl" }], limit: 5 },
    ctx,
    REGISTRY,
    tracker,
  );
  assert.equal(second.ok, true);
  // Derde poging: budget op, ondanks dat poging 1 DENY'd was.
  const third = await executeEmployeeTool("employee_discovery", { companies: [] }, ctx, REGISTRY, tracker);
  assert.equal(third.error, "BUDGET_EXCEEDED");
});

test("adapter-integratie: netwerk-teller bij employee_website_research", async () => {
  let fetches = 0;
  const tracker = new EmployeeBudgetTracker({ ...DEFAULT_EMPLOYEE_BUDGET, maxNetworkRequests: 5 });
  const ctx = makeContext({
    fetchImpl: async () => {
      fetches += 1;
      return new Response("<html><body><h1>Acme</h1></body></html>", { status: 200 });
    },
    lookup: async () => ["93.184.216.34"],
  });
  const result = await executeEmployeeTool(
    "employee_website_research",
    { websiteUrl: "https://acme.nl", domain: "acme.nl" },
    ctx,
    REGISTRY,
    tracker,
  );
  assert.equal(result.ok, true);
  assert.ok(fetches >= 1);
  assert.equal(tracker.snapshot().networkRequests, fetches);
});

test("adapter-integratie: zonder tracker geen budget-gedrag (backwards compatible)", async () => {
  const ctx = makeContext();
  const result = await executeEmployeeTool(
    "employee_discovery",
    { companies: [{ name: "Acme", websiteUrl: "https://acme.nl" }], limit: 5 },
    ctx,
    REGISTRY,
  );
  assert.equal(result.ok, true);
});
