import assert from "node:assert/strict";
import { test } from "node:test";

import { executeEmployeeTool } from "../lib/autonomous-employee/registry-adapter.ts";
import type { EmployeeToolContext } from "../lib/autonomous-employee/types.ts";
import { discoverTools } from "../lib/tool-registry/discovery.ts";
import {
  createToolRegistryV2,
  type ToolRegistryV2Options,
} from "../lib/tool-registry/registry.ts";
import {
  loadTenantToolPolicies,
  resolveApprovalRequirement,
  resolveTenantToolPolicy,
  type TenantPolicyRow,
  type TenantPolicySql,
} from "../lib/tool-registry/tenant-policy.ts";
import {
  CALENDAR_CANCEL,
  CALENDAR_READ,
  CONTACT_CREATE,
  EMAIL_SEND,
  TOOL_SPECS,
} from "../lib/tool-registry/tools.ts";

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makeRegistry(options: ToolRegistryV2Options = {}) {
  return createToolRegistryV2(TOOL_SPECS, options);
}

/** Resolver uit een per-tenant Map (test-double voor loadTenantToolPolicies). */
function resolverFrom(policies: Record<string, Record<string, TenantPolicyRow>>) {
  return (tenantId: string, toolId: string): TenantPolicyRow | null =>
    policies[tenantId]?.[toolId] ?? null;
}

// ---- resolveTenantToolPolicy: pure resolutie (§4) ----

test("tenant policy: geen rij → spec-default (backwards compatible)", () => {
  // CALENDAR_READ: LOW + tenantPolicy TENANT → beschikbaar, geen approval.
  const read = resolveTenantToolPolicy(CALENDAR_READ, null);
  assert.deepEqual(read, { enabled: true, approvalRequired: false });
  // CONTACT_CREATE: MEDIUM + tenantPolicy APPROVAL → approval (spec-default).
  const write = resolveTenantToolPolicy(CONTACT_CREATE, null);
  assert.deepEqual(write, { enabled: true, approvalRequired: true });
  // EMAIL_SEND: HIGH → approval altijd (risk-based), ook zonder rij;
  // enabled blijft spec-default (fail-closed: send staat nooit automatisch aan).
  const send = resolveTenantToolPolicy(EMAIL_SEND, null);
  assert.deepEqual(send, { enabled: false, approvalRequired: true });
});

test("tenant policy: rij ON → beschikbaar; rij OFF → OFF wint (geen approval)", () => {
  const on: TenantPolicyRow = { policy: "ON" };
  const off: TenantPolicyRow = { policy: "OFF" };
  assert.deepEqual(resolveTenantToolPolicy(CALENDAR_READ, on), { enabled: true, approvalRequired: false });
  assert.deepEqual(resolveTenantToolPolicy(CALENDAR_READ, off), { enabled: false, approvalRequired: false });
  // OFF + approval-spec: OFF wint — geen approval-aanvraag voor iets dat nooit mag.
  assert.deepEqual(resolveTenantToolPolicy(CONTACT_CREATE, off), { enabled: false, approvalRequired: false });
  assert.deepEqual(resolveTenantToolPolicy(CALENDAR_CANCEL, off), { enabled: false, approvalRequired: false });
});

test("tenant policy: rij APPROVAL + MEDIUM → approval ook voor MEDIUM; HIGH blijft risk-based", () => {
  const approval: TenantPolicyRow = { policy: "APPROVAL" };
  // CONTACT_CREATE (MEDIUM, spec APPROVAL): rij ON verwijdert de approval niet? —
  // Nee: spec-default is APPROVAL; rij ON → spec-default risk-based (MEDIUM → geen approval).
  assert.deepEqual(resolveTenantToolPolicy(CONTACT_CREATE, { policy: "ON" }), {
    enabled: true,
    approvalRequired: false,
  });
  // rij APPROVAL op een LOW-tool (CALENDAR_READ) → approval vereist.
  assert.deepEqual(resolveTenantToolPolicy(CALENDAR_READ, approval), {
    enabled: true,
    approvalRequired: true,
  });
  // HIGH (CALENDAR_CANCEL) met rij ON → approval blijft (risk wint).
  assert.deepEqual(resolveTenantToolPolicy(CALENDAR_CANCEL, { policy: "ON" }), {
    enabled: true,
    approvalRequired: true,
  });
});

// ---- resolveApprovalRequirement (TASK 6-interface, data-laag) ----

test("tenant policy: resolveApprovalRequirement — CRITICAL tweede ogen, HIGH altijd, MEDIUM alleen APPROVAL-rij", async () => {
  let loadCalls = 0;
  const loader = async (tenantId: string, toolId: string): Promise<TenantPolicyRow | null> => {
    loadCalls += 1;
    void tenantId;
    void toolId;
    return null;
  };
  const critical = await resolveApprovalRequirement(TENANT_A, "x", "CRITICAL", loader);
  assert.deepEqual(critical, { required: true, secondApproval: true });
  const high = await resolveApprovalRequirement(TENANT_A, "x", "HIGH", loader);
  assert.deepEqual(high, { required: true, secondApproval: false });
  assert.equal(loadCalls, 0); // CRITICAL/HIGH vragen geen rij op

  const approvalRow = async (): Promise<TenantPolicyRow> => ({ policy: "APPROVAL" });
  const onRow = async (): Promise<TenantPolicyRow> => ({ policy: "ON" });
  assert.deepEqual(await resolveApprovalRequirement(TENANT_A, "contact_create", "MEDIUM", approvalRow), {
    required: true,
    secondApproval: false,
  });
  assert.deepEqual(await resolveApprovalRequirement(TENANT_A, "contact_create", "MEDIUM", onRow), {
    required: false,
    secondApproval: false,
  });
  assert.deepEqual(await resolveApprovalRequirement(TENANT_A, "contact_create", "MEDIUM", async () => null), {
    required: false,
    secondApproval: false,
  });
});

test("tenant policy: load-fout → fail-closed (approval verplicht)", async () => {
  const throwing = async (): Promise<TenantPolicyRow> => {
    throw new Error("database unavailable");
  };
  const result = await resolveApprovalRequirement(TENANT_A, "contact_create", "MEDIUM", throwing);
  assert.deepEqual(result, { required: true, secondApproval: false });
});

// ---- loadTenantToolPolicies: tenant-scoped data-loading ----

function fakePolicySql(rows: unknown[]): { sql: TenantPolicySql; queries: string[] } {
  const queries: string[] = [];
  const sql: TenantPolicySql = async (strings, ...values) => {
    queries.push(`${strings[0]} ${values.join(",")}`);
    return rows;
  };
  return { sql, queries };
}

test("tenant policy: loadTenantToolPolicies — tenant-scoped, ongeldige rijen overgeslagen", async () => {
  const { sql, queries } = fakePolicySql([
    { tool_id: "email_send", policy: "OFF" },
    { tool_id: "calendar_read", policy: "ON" },
    { tool_id: "kapotte_rij", policy: "MAYBE" }, // ongeldig → overgeslagen
    { tool_id: "zonder_policy" }, // ongeldig → overgeslagen
  ]);
  const map = await loadTenantToolPolicies(sql, TENANT_A);
  assert.match(queries[0]!, /WHERE tenant_id/); // tenant-scoped — cross-tenant leakage onmogelijk
  assert.equal(map.size, 2);
  assert.equal(map.get("email_send")?.policy, "OFF");
  assert.equal(map.get("calendar_read")?.policy, "ON");
  assert.equal(map.has("kapotte_rij"), false); // fail-closed: kapotte rij forceert nooit ON
});

// ---- registry-integratie: isEnabled / approvalRequired / isTenantPolicyOff ----

test("tenant policy: registry zonder resolver = vandaag (backwards compatible)", () => {
  const registry = makeRegistry();
  assert.equal(registry.isEnabled("email_send", TENANT_A), false); // spec.enabled false
  assert.equal(registry.isEnabled("contact_create", TENANT_A), true);
  assert.equal(registry.approvalRequired("email_send", TENANT_A), true); // HIGH
  assert.equal(registry.approvalRequired("contact_create", TENANT_A), true); // spec APPROVAL
  assert.equal(registry.approvalRequired("calendar_read", TENANT_A), false); // LOW
  assert.equal(registry.isTenantPolicyOff("email_send", TENANT_A), false);
});

test("tenant policy: rij OFF → isEnabled false + TENANT_POLICY; rij ON → beschikbaar; cross-tenant geïsoleerd", () => {
  const policies = {
    [TENANT_A]: { email_send: { policy: "OFF" as const } },
    [TENANT_B]: { email_send: { policy: "ON" as const }, calendar_read: { policy: "OFF" as const } },
  };
  const registry = makeRegistry({ tenantPolicyResolver: resolverFrom(policies) });
  // Tenant A: email_send OFF → uit; contact_create geen rij → spec-default.
  assert.equal(registry.isEnabled("email_send", TENANT_A), false);
  assert.equal(registry.isTenantPolicyOff("email_send", TENANT_A), true);
  assert.equal(registry.isEnabled("contact_create", TENANT_A), true);
  // Tenant B: email_send ON (operator kiest per tenant — enabled ondanks spec.enabled false).
  assert.equal(registry.isEnabled("email_send", TENANT_B), true);
  assert.equal(registry.isTenantPolicyOff("email_send", TENANT_B), false);
  // Cross-tenant: A's OFF geldt niet voor B en vice versa.
  assert.equal(registry.isEnabled("calendar_read", TENANT_A), true);
  assert.equal(registry.isEnabled("calendar_read", TENANT_B), false);
  // Zonder tenantId → spec-gedreven (fail-closed default).
  assert.equal(registry.isEnabled("email_send"), false);
});

test("tenant policy: rij APPROVAL + MEDIUM → approvalRequired; OFF + approval → OFF wint", () => {
  const policies = {
    [TENANT_A]: {
      calendar_read: { policy: "APPROVAL" as const }, // LOW-tool → approval
      contact_create: { policy: "OFF" as const }, // OFF wint over spec APPROVAL
    },
  };
  const registry = makeRegistry({ tenantPolicyResolver: resolverFrom(policies) });
  assert.equal(registry.approvalRequired("calendar_read", TENANT_A), true); // APPROVAL-rij
  assert.equal(registry.isEnabled("calendar_read", TENANT_A), true);
  assert.equal(registry.approvalRequired("contact_create", TENANT_A), false); // OFF wint
  assert.equal(registry.isEnabled("contact_create", TENANT_A), false);
  // HIGH blijft approval, ongeacht rij ON.
  assert.equal(registry.approvalRequired("email_send", TENANT_A), true);
});

// ---- discovery-integratie (via registry — één resolutie-bron) ----

test("tenant policy: discovery sluit OFF-tools uit en markeert APPROVAL-tools", () => {
  const policies = {
    [TENANT_A]: {
      email_send: { policy: "OFF" as const },
      calendar_read: { policy: "APPROVAL" as const },
    },
  };
  const registry = makeRegistry({ tenantPolicyResolver: resolverFrom(policies) });
  // Tenant A: email_send OFF → nooit aangeboden.
  const result = discoverTools({ intent: "email versturen", agentId: "x", tenantId: TENANT_A }, registry);
  assert.equal(result.tools.some((t) => t.id === "email_send"), false);
  // APPROVAL-rij op LOW-tool → gemarkeerd (markeer, verberg niet).
  const calendar = discoverTools({ intent: "calendar beschikbaarheid", agentId: "x", tenantId: TENANT_A }, registry);
  assert.equal(calendar.tools.some((t) => t.id === "calendar_read"), true);
  assert.equal(calendar.approvalRequired.includes("calendar_read"), true);
  // Zelfde intent zonder tenant-policies → geen approval-markering voor calendar_read.
  const plain = discoverTools({ intent: "calendar beschikbaarheid", agentId: "x" }, makeRegistry());
  assert.equal(plain.approvalRequired.includes("calendar_read"), false);
});

// ---- employee-flow: rij OFF → DENY (TENANT_POLICY) ----

test("tenant policy: employee-flow met rij OFF → DENY (TENANT_POLICY), geen handler-call", async () => {
  const policies = {
    [TENANT_A]: { employee_qualify: { policy: "OFF" as const } },
  };
  const registry = makeRegistry({ tenantPolicyResolver: resolverFrom(policies) });
  const ctx: EmployeeToolContext = {
    tenantId: TENANT_A,
    sql: async () => [],
    now: () => "2026-09-01T08:00:00.000Z",
  };
  const result = await executeEmployeeTool("employee_qualify", { company: "Acme BV" }, ctx, registry);
  assert.equal(result.ok, false);
  assert.equal(result.error, "TENANT_POLICY");
  assert.equal(result.policy.allowed, false);

  // Zelfde call zonder rij → handler-pad (qualify zonder analyzer → fout van de tool, geen policy-DENY).
  const plainRegistry = makeRegistry();
  const noPolicy = await executeEmployeeTool("employee_qualify", { company: "Acme BV" }, ctx, plainRegistry);
  assert.notEqual(noPolicy.error, "TENANT_POLICY");
  assert.notEqual(noPolicy.error, "TOOL_DISABLED");
});
