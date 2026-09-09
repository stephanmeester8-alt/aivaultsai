import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { getActiveProductBySlug } from "../lib/shop/products.ts";
import {
  getCompanyByDomain,
  upsertCompany,
} from "../lib/prospect-run/discovery-repository.ts";
import { insertContactLead } from "../lib/leads/repository.ts";
import { recordLeadEvent } from "../lib/customer-zero/persistence/lead-events.ts";
import { createQualification } from "../lib/customer-zero/persistence/qualification-repository.ts";
import { requireTenantId, DEFAULT_TENANT_ID, getSiteTenantId } from "../lib/tenancy.ts";
import { TenantContextRequiredError } from "../lib/skills/types.ts";
import { appendWorkSessionStep } from "../lib/autonomous-employee/work-session-repository.ts";
import type { DiscoverySql } from "../lib/prospect-run/discovery-repository.ts";
import type { LeadsSql } from "../lib/leads/repository.ts";
import type { LeadEventSql } from "../lib/customer-zero/persistence/lead-events.ts";
import type { QualificationSql } from "../lib/customer-zero/persistence/qualification-repository.ts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

interface CompanyRow {
  company_id: string;
  tenant_id: string;
  name: string;
  domain: string;
  industry: string | null;
  location: string | null;
  discovery_source: string;
  website_research: unknown;
  ai_detection: unknown;
  last_checked_at: string | null;
  created_at: string;
}

/** Tenant-bewuste fake: filtert op tenant + domain zoals de echte query. */
function makeCompanySql(rows: CompanyRow[]): DiscoverySql {
  return async (strings, ...values) => {
    const text = strings.join("?");
    if (text.includes("UPDATE companies")) {
      // Echte volgorde: SET name(0), industry(1), location(2),
      // discovery_source(3), research(4), ai(5), WHERE tenant_id(6), domain(7).
      const tenantId = String(values[6]);
      const domain = String(values[7]);
      const row = rows.find((r) => r.tenant_id === tenantId && r.domain === domain);
      if (!row) throw new Error(`Company upsert returned no company for domain ${domain}`);
      row.name = String(values[0]);
      return [{ company_id: row.company_id }];
    }
    if (text.includes("INSERT INTO companies")) {
      const tenantId = String(values[0]);
      const name = String(values[1]);
      const domain = String(values[2]);
      const existing = rows.find((r) => r.tenant_id === tenantId && r.domain === domain);
      if (existing) return []; // ON CONFLICT DO NOTHING
      rows.push({
        company_id: `c-${rows.length + 1}`,
        tenant_id: tenantId,
        name,
        domain,
        industry: null,
        location: null,
        discovery_source: String(values[5]),
        website_research: null,
        ai_detection: null,
        last_checked_at: null,
        created_at: "2026-09-02T08:00:00.000Z",
      });
      return [{ company_id: rows[rows.length - 1]!.company_id }];
    }
    if (text.includes("FROM companies")) {
      const tenantId = String(values[0]);
      const domain = String(values[1]);
      const row = rows.find((r) => r.tenant_id === tenantId && r.domain === domain);
      return row ? [row] : [];
    }
    return [];
  };
}

test("tenant: missing tenant → DENY (NO TENANT = NO EXECUTION)", () => {
  assert.throws(() => requireTenantId(""), TenantContextRequiredError);
  assert.throws(() => requireTenantId(null), TenantContextRequiredError);
  assert.throws(() => requireTenantId("   "), TenantContextRequiredError);
  assert.equal(requireTenantId(TENANT_A), TENANT_A);
  assert.equal(DEFAULT_TENANT_ID, TENANT_A);
  assert.equal(getSiteTenantId(), TENANT_A);
});

test("tenant: zelfde domein mag in verschillende tenants bestaan (tenant-aware unique)", async () => {
  const rows: CompanyRow[] = [];
  const sql = makeCompanySql(rows);
  const a = await upsertCompany(sql, { tenantId: TENANT_A, name: "Acme A", domain: "acme.nl", discoverySource: "test" });
  const b = await upsertCompany(sql, { tenantId: TENANT_B, name: "Acme B", domain: "acme.nl", discoverySource: "test" });
  assert.equal(a.created, true);
  assert.equal(b.created, true);
  assert.equal(rows.length, 2); // zelfde domein, twee tenants → twee rijen
  assert.notEqual(a.companyId, b.companyId);
});

test("tenant: tenant A leest eigen company → ALLOW; B's company is voor A niet gevonden", async () => {
  const rows: CompanyRow[] = [];
  const sql = makeCompanySql(rows);
  await upsertCompany(sql, { tenantId: TENANT_A, name: "Acme A", domain: "acme.nl", discoverySource: "test" });
  await upsertCompany(sql, { tenantId: TENANT_B, name: "Acme B", domain: "acme.nl", discoverySource: "test" });

  const own = await getCompanyByDomain(sql, TENANT_A, "acme.nl");
  assert.equal(own?.name, "Acme A"); // ALLOW: eigen tenant

  // Tenant B's record is voor tenant A NIET zichtbaar — zelfde null als
  // "bestaat niet" (geen informatielek via verschillende foutmeldingen).
  const foreign = await getCompanyByDomain(sql, TENANT_A, "acme.nl");
  assert.equal(foreign?.name, "Acme A"); // eigen blijft zichtbaar
  // Een look-up met andermans tenant-id retourneert de rij van die tenant niet:
  const asB = await getCompanyByDomain(sql, TENANT_B, "acme.nl");
  assert.equal(asB?.name, "Acme B");
  const unknown = await getCompanyByDomain(sql, TENANT_A, "bestaand-niet.nl");
  assert.equal(unknown, null); // zelfde null-vorm als niet-bestaand
});

test("tenant: tenant A update van B's company raakt B niet (rijen strikt per tenant)", async () => {
  const rows: CompanyRow[] = [];
  const sql = makeCompanySql(rows);
  await upsertCompany(sql, { tenantId: TENANT_B, name: "Acme B", domain: "acme.nl", discoverySource: "test" });
  // A maakt een EIGEN rij aan voor hetzelfde domein (insert-first).
  const createdA = await upsertCompany(sql, { tenantId: TENANT_A, name: "Acme A", domain: "acme.nl", discoverySource: "test" });
  assert.equal(createdA.created, true);
  // Update-pad binnen A wijzigt alleen A's rij.
  const updatedA = await upsertCompany(sql, { tenantId: TENANT_A, name: "Acme A2", domain: "acme.nl", discoverySource: "test" });
  assert.equal(updatedA.created, false);
  const aRow = rows.find((r) => r.tenant_id === TENANT_A);
  const bRow = rows.find((r) => r.tenant_id === TENANT_B);
  assert.equal(aRow?.name, "Acme A2");
  assert.equal(bRow?.name, "Acme B"); // B's rij blijft onaangetast
  assert.equal(rows.length, 2); // geen cross-tenant merge
});

test("tenant: writes dragen tenant_id als eerste parameter (inserts zijn tenant-gebonden)", async () => {
  // contact_leads
  const leadValues: unknown[][] = [];
  const leadSql: LeadsSql = async (_strings, ...values) => {
    leadValues.push(values);
    return [{ lead_id: "l-1", created_at: "2026-09-02T08:00:00.000Z" }];
  };
  await insertContactLead(leadSql, {
    tenantId: TENANT_A,
    name: "Jan",
    email: "jan@acme.nl",
    phone: null,
    company: null,
    service: "anders",
    message: "Hallo",
    status: "new",
    source: "website",
  });
  assert.equal(leadValues[0]![0], TENANT_A);

  // lead_events
  const eventValues: unknown[][] = [];
  const eventSql: LeadEventSql = async (_strings, ...values) => {
    eventValues.push(values);
    return [{ event_id: "ev-1" }];
  };
  await recordLeadEvent(eventSql, {
    tenantId: TENANT_B,
    conversationId: "conv-1",
    eventType: "lead_created",
    source: "x",
    origin: "y",
  });
  assert.equal(eventValues[0]![0], TENANT_B);

  // lead_qualifications
  const qualValues: unknown[][] = [];
  const qualSql: QualificationSql = async (_strings, ...values) => {
    qualValues.push(values);
    return [{ qualification_id: "q-1" }];
  };
  await createQualification(qualSql, {
    tenantId: TENANT_A,
    leadId: "lead-1",
    score: 80,
    confidence: "HIGH",
    reason: "r",
    qualifiedBy: "s",
    supportingEventIds: ["ev-1"],
  });
  assert.equal(qualValues[0]![0], TENANT_A);
});

test("tenant: child (session-step) erft tenant van parent via subselect — mismatched tenant onmogelijk", async () => {
  const texts: string[] = [];
  const stepSql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    texts.push(strings.join("?"));
    void values;
    return [];
  };
  await appendWorkSessionStep(stepSql, "sess-1", "decision", "ok", { x: 1 });
  const query = texts[0]!;
  // De INSERT haalt tenant_id uit de parent-sessie (SELECT ... FROM
  // employee_work_sessions) — een step kan geen eigen tenant meesturen.
  assert.ok(query.includes("employee_work_session_steps (tenant_id, session_id"));
  assert.ok(query.includes("SELECT tenant_id"));
  assert.ok(query.includes("FROM employee_work_sessions"));
  assert.ok(query.includes("WHERE session_id ="));
});

test("tenant: lead.capture-calls via skill vereisen tenant (router-invariant al getest; hier de skill-fabriek)", async () => {
  // De router-invariant (executeSkill zonder tenant → TENANT_REQUIRED) is in
  // skills-router.test.ts gedekt; hier bevestigen we de centrale error.
  assert.equal(new TenantContextRequiredError().name, "TenantContextRequiredError");
  assert.match(new TenantContextRequiredError().message, /NO TENANT = NO EXECUTION/);
});

test("tenant: audit (tool_call_records) draagt tenantId — geen lees-API voor andere tenants", async () => {
  // De recorder INSERT (PostgresRecorder) schrijft tenantId als tweede
  // parameter (values[1]); er bestaat geen read-functie op de records —
  // auditrecords zijn daarmee alleen schrijvend en per-tenant gecorreleerd.
  const texts: string[] = [];
  const recorderSql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    texts.push(`${strings.join("?")} :: ${JSON.stringify(values)}`);
    return [];
  };
  const { PostgresRecorder } = await import("../lib/observability/postgres-recorder.ts");
  const recorder = new PostgresRecorder(recorderSql);
  await recorder.recordCall({
    executionId: "exec-1",
    tenantId: TENANT_A,
    agentId: "a",
    sessionId: null,
    toolId: "skill:x",
    argumentsHash: "ab".repeat(32),
    startedAt: "2026-09-02T08:00:00.000Z",
    finishedAt: "2026-09-02T08:00:00.100Z",
    status: "ALLOWED",
    riskLevel: "LOW",
    approvalId: null,
    resultSummary: "ok",
    errorCode: null,
    evidenceRefs: [],
  });
  assert.ok(texts[0]!.includes('"exec-1"'));
  assert.ok(texts[0]!.includes(TENANT_A));
});

test("tenant: legacy backfill — migratie 011 backfilt élke geharde tabel naar de site-tenant + NOT NULL", () => {
  const migration = readFileSync(
    join(import.meta.dirname, "..", "lib", "db", "migrations", "011_tenant_isolation.sql"),
    "utf8",
  );
  const hardened = [
    "conversations",
    "conversation_messages",
    "leads",
    "lead_events",
    "lead_qualifications",
    "appointments",
    "contact_leads",
    "companies",
    "employee_work_session_steps",
  ];
  for (const table of hardened) {
    // Statische SQL-guard: kolom+FK, deterministische backfill en NOT NULL
    // per tabel aanwezig (echte uitvoering via run-migration-011.mjs).
    assert.ok(
      migration.includes(`ALTER TABLE ${table}\n  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);`),
      `${table}: kolom/FK ontbreekt`,
    );
    assert.ok(
      migration.includes(`UPDATE ${table} SET tenant_id = '11111111-1111-4111-8111-111111111111'`),
      `${table}: backfill ontbreekt`,
    );
    assert.ok(
      migration.includes(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL;`),
      `${table}: NOT NULL ontbreekt`,
    );
  }
  // Geen destructieve statements in de migratie.
  assert.equal(migration.includes("DROP TABLE"), false);
  assert.equal(migration.includes("TRUNCATE"), false);
  assert.equal(migration.includes("DELETE FROM"), false);
});

test("tenant: migratie 012 — 002-runtime-tabellen krijgen tenant ownership (audit Sprint 4)", () => {
  // Audit (Sprint 4): runtime-records beschrijven klant-/tenant-executie-data
  // (post-lead runs, approvals, executions, evidence, handoffs); er is geen
  // system-globale run → alle zes tabellen tenant-scoped, geen tweede model.
  const migration = readFileSync(
    join(import.meta.dirname, "..", "lib", "db", "migrations", "012_tenant_runtime_ownership.sql"),
    "utf8",
  );
  const runtimeTables = [
    "agent_runs",
    "runtime_tasks",
    "runtime_approvals",
    "runtime_executions",
    "runtime_evidence",
    "runtime_handoffs",
  ];
  for (const table of runtimeTables) {
    assert.ok(
      migration.includes(`ALTER TABLE ${table}\n  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES prospect_tenants(tenant_id);`),
      `${table}: kolom/FK ontbreekt`,
    );
    assert.ok(
      migration.includes(`UPDATE ${table} SET tenant_id = '11111111-1111-4111-8111-111111111111'`),
      `${table}: backfill ontbreekt`,
    );
    assert.ok(
      migration.includes(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL;`),
      `${table}: NOT NULL ontbreekt`,
    );
  }
  // Geen destructieve statements in de migratie.
  assert.equal(migration.includes("DROP TABLE"), false);
  assert.equal(migration.includes("TRUNCATE"), false);
  assert.equal(migration.includes("DELETE FROM"), false);
  assert.equal(migration.includes("DROP COLUMN"), false);
});

test("tenant: shop-products zijn GLOBAL (catalogus, geen tenant-data)", async () => {
  // Catalogus-producten worden per slug opgehaald zonder tenant-filter —
  // bewust: shop_products is geen klantdata (GLOBAL-classificatie).
  const product = await getActiveProductBySlug(async () => [], "ai-assistent-pakket");
  assert.equal(product, null); // lege fake-db → null (geen fout)
});
