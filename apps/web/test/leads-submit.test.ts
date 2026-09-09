import assert from "node:assert/strict";
import { test } from "node:test";

import { insertContactLead } from "../lib/leads/repository.ts";
import { submitLead } from "../lib/leads/submit.ts";
import type { LeadNotifier } from "../lib/leads/notify.ts";
import type { LeadSubmission } from "../lib/leads/validation.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";

const VALID: LeadSubmission = {
  name: "Jan Jansen",
  email: "jan@acme.nl",
  phone: "0612345678",
  company: "Acme BV",
  service: "ai-assistent",
  message: "We willen een AI-assistent voor klantvragen.",
  website: "",
};

function makeSql(failInsert = false) {
  const inserts: Array<Record<string, unknown>> = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("INSERT INTO contact_leads")) {
      if (failInsert) throw new Error("database unavailable");
      inserts.push({
        tenantId: values[0],
        name: values[1],
        phone: values[3],
        company: values[4],
        email: values[2],
        message: values[6],
        service: values[5],
        status: values[7],
        source: values[8],
      });
      return [{ lead_id: "lead-1", created_at: "2026-09-02T08:00:00.000Z" }];
    }
    return [];
  };
  return { sql, inserts };
}

function countingNotifier(): LeadNotifier & { calls: { count: number } } {
  const calls = { count: 0 };
  const notifier = (async () => {
    calls.count += 1;
  }) as LeadNotifier;
  return Object.assign(notifier, { calls });
}

test("leads submit: geldige lead → insert met defaults + notificatie + leadId", async () => {
  const shop = makeSql();
  const notifier = countingNotifier();
  const result = await submitLead(
    { tenantId: TENANT, sql: shop.sql, notifier, now: () => "2026-09-02T08:00:00.000Z", log: () => {} },
    VALID,
  );
  assert.deepEqual(result, { ok: true, discarded: false, leadId: "lead-1" });
  assert.equal(shop.inserts.length, 1);
  assert.equal(shop.inserts[0]!.status, "new"); // default
  assert.equal(shop.inserts[0]!.source, "website"); // default
  assert.equal(shop.inserts[0]!.email, "jan@acme.nl");
  assert.equal(notifier.calls.count, 1);
});

test("leads submit: honeypot → stil succes ZONDER insert en zonder notificatie", async () => {
  const shop = makeSql();
  const notifier = countingNotifier();
  const result = await submitLead(
    { tenantId: TENANT, sql: shop.sql, notifier, log: () => {} },
    { ...VALID, website: "https://spam.example.com" },
  );
  assert.deepEqual(result, { ok: true, discarded: true });
  assert.equal(shop.inserts.length, 0); // geen insert
  assert.equal(notifier.calls.count, 0);
});

test("leads submit: database-fout → STORAGE_FAILED (geen succes, geen notificatie)", async () => {
  const shop = makeSql(true); // insert gooit
  const notifier = countingNotifier();
  const result = await submitLead({ tenantId: TENANT, sql: shop.sql, notifier, log: () => {} }, VALID);
  assert.deepEqual(result, { ok: false, error: "STORAGE_FAILED" });
  assert.equal(notifier.calls.count, 0); // nooit notificeren als de lead niet is opgeslagen
});

test("leads submit: notificatie-fout → lead blijft, succes retourneren (DB > mail)", async () => {
  const shop = makeSql();
  const failingNotifier = (async () => {
    throw new Error("RESEND_API_ERROR:500");
  }) as LeadNotifier;
  const logs: string[] = [];
  const result = await submitLead(
    { tenantId: TENANT, sql: shop.sql, notifier: failingNotifier, log: (m) => void logs.push(m) },
    VALID,
  );
  assert.deepEqual(result, { ok: true, discarded: false, leadId: "lead-1" });
  assert.equal(shop.inserts.length, 1); // lead is opgeslagen en blijft
  assert.ok(logs.some((l) => l.includes("notification failed") && l.includes("lead-1")));
});

test("leads submit: zonder notifier → lead wordt wél opgeslagen (gelogd)", async () => {
  const shop = makeSql();
  const logs: string[] = [];
  const result = await submitLead(
    { tenantId: TENANT, sql: shop.sql, notifier: null, log: (m) => void logs.push(m) },
    VALID,
  );
  assert.deepEqual(result, { ok: true, discarded: false, leadId: "lead-1" });
  assert.equal(shop.inserts.length, 1);
  assert.ok(logs.some((l) => l.includes("without notification")));
});

test("leads repository: insert retourneert leadId + createdAt", async () => {
  const shop = makeSql();
  const inserted = await insertContactLead(shop.sql, { tenantId: TENANT,
    name: "Jan Jansen",
    email: "jan@acme.nl",
    phone: null,
    company: null,
    service: "anders",
    message: "Hallo",
    status: "new",
    source: "website",
  });
  assert.equal(inserted.leadId, "lead-1");
  assert.equal(inserted.createdAt, "2026-09-02T08:00:00.000Z");
});
