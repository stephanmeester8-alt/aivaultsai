import assert from "node:assert/strict";
import { test } from "node:test";

import {
  executeContactSearch,
  executeLeadRead,
  sanitizeContact,
} from "../lib/tool-registry/adapters/crm.ts";
import type { CrmClient, CrmContact, CrmLead } from "../lib/crm/client.ts";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";

function makeClient(overrides: Partial<CrmClient> = {}): CrmClient {
  const contacts: CrmContact[] = [
    { id: "c1", name: "Jan Jansen", email: "jan@acme.nl", company: "Acme BV", role: "CTO" },
    { id: "c2", name: "Piet Pieters", email: "piet@beta.nl", company: "Beta BV", role: null },
  ];
  const lead: CrmLead = { id: "l1", company: "Acme BV", status: "OPEN", owner: "sales@owner", updatedAt: "2026-08-01T00:00:00.000Z" };
  return {
    searchContacts: async (query, ctx) => {
      assert.equal(ctx.tenantId, TENANT_ID); // contract: tenant verplicht
      return contacts.filter((c) => !query.q || c.name.toLowerCase().includes(query.q.toLowerCase()));
    },
    getLead: async (leadId, ctx) => {
      assert.equal(ctx.tenantId, TENANT_ID);
      return leadId === lead.id ? lead : null;
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Parameters<typeof executeContactSearch>[1]> = {}) {
  return { client: makeClient(), tenantId: TENANT_ID, log: () => {}, ...overrides };
}

test("crm read: contact_search valide → bounded contacts", async () => {
  const result = await executeContactSearch({ q: "Jan", limit: 5 }, makeDeps());
  assert.equal(result.ok, true);
  assert.equal(result.value?.contacts.length, 1);
  assert.equal(result.value?.contacts[0]?.name, "Jan Jansen");
  assert.equal(result.value?.truncated, false);
  assert.match(result.audit!.queryHash, /^[0-9a-f]{64}$/);
  assert.equal(result.audit?.count, 1);
});

test("crm read: contact_search zonder zoekterm / onbekend veld / limit > 20 → DENY", async () => {
  const deps = makeDeps();
  assert.equal((await executeContactSearch({}, deps)).error, "INVALID_SEARCH_INPUT");
  assert.equal((await executeContactSearch({ q: "x", extra: 1 }, deps)).error, "INVALID_SEARCH_INPUT");
  assert.equal((await executeContactSearch({ q: "x", limit: 21 }, deps)).error, "INVALID_SEARCH_INPUT");
  assert.equal((await executeContactSearch({ q: "   " }, deps)).error, "INVALID_SEARCH_INPUT");
  assert.equal((await executeContactSearch("geen-object", deps)).error, "INVALID_SEARCH_INPUT");
});

test("crm read: tenantId ontbreekt → DENY (geen globale calls)", async () => {
  const result = await executeContactSearch({ q: "Jan" }, { client: makeClient(), tenantId: "  ", log: () => {} });
  assert.equal(result.ok, false);
  assert.equal(result.error, "TENANT_REQUIRED");
});

test("crm read: lead_read valide → lead; niet gevonden → lead null (geen gok)", async () => {
  const deps = makeDeps();
  const found = await executeLeadRead({ leadId: "l1" }, deps);
  assert.equal(found.ok, true);
  assert.equal(found.value?.lead?.company, "Acme BV");
  const missing = await executeLeadRead({ leadId: "l999" }, deps);
  assert.equal(missing.ok, true);
  assert.equal(missing.value?.lead, null);
  assert.equal(missing.audit?.count, 0);
});

test("crm read: lead_read ongeldig → DENY", async () => {
  const deps = makeDeps();
  assert.equal((await executeLeadRead({}, deps)).error, "INVALID_LEAD_INPUT");
  assert.equal((await executeLeadRead({ leadId: "l1", extra: 1 }, deps)).error, "INVALID_LEAD_INPUT");
  assert.equal((await executeLeadRead({ leadId: "" }, deps)).error, "INVALID_LEAD_INPUT");
});

test("crm read: PII-redactie — notities/extra velden nooit in output", async () => {
  const client = makeClient({
    searchContacts: async () => [
      {
        id: "c1",
        name: "Jan Jansen",
        email: "jan@acme.nl",
        company: "Acme BV",
        role: "CTO",
        notes: "GEHEIM: belde over prijzen",
        conversationHistory: ["gesprek 1"],
      } as unknown as CrmContact,
    ],
  });
  const result = await executeContactSearch({ q: "Jan" }, { client, tenantId: TENANT_ID, log: () => {} });
  assert.equal(result.ok, true);
  const serialized = JSON.stringify(result.value);
  assert.ok(!serialized.includes("GEHEIM"));
  assert.ok(!serialized.includes("gesprek 1"));
  assert.deepEqual(Object.keys(result.value!.contacts[0]!).sort(), ["company", "email", "id", "name", "role"]);
});

test("crm read: sanitizeContact verwijdert ongeldige records (data-hygiëne)", () => {
  assert.equal(sanitizeContact(null), null);
  assert.equal(sanitizeContact({ id: "x", name: "", email: "a@b.nl" }), null); // lege naam
  assert.equal(sanitizeContact({ id: "x", name: "N", email: "a@b.nl", company: "c".repeat(201) }), null); // company > 200
  const ok = sanitizeContact({ id: "x", name: "Naam", email: "a@b.nl", role: "CEO" });
  assert.equal(ok?.role, "CEO");
});

test("crm read: truncated bij limiet", async () => {
  const client = makeClient({
    searchContacts: async () => [
      { id: "1", name: "A", email: "a@x.nl", company: null, role: null },
      { id: "2", name: "B", email: "b@x.nl", company: null, role: null },
    ],
  });
  const result = await executeContactSearch({ q: "x", limit: 1 }, { client, tenantId: TENANT_ID, log: () => {} });
  assert.equal(result.value?.contacts.length, 1);
  assert.equal(result.value?.truncated, true);
  assert.equal(result.audit?.truncated, true);
});

test("crm read: client-fout → gecontroleerde fout (geen auto-retry)", async () => {
  const client = makeClient({
    searchContacts: async () => {
      throw new Error("crm kapot");
    },
  });
  const result = await executeContactSearch({ q: "Jan" }, { client, tenantId: TENANT_ID, log: () => {} });
  assert.equal(result.ok, false);
  assert.equal(result.error, "CRM_CLIENT_ERROR");
});

test("crm read: determinisme (zelfde input → zelfde output)", async () => {
  const deps = makeDeps();
  const first = await executeContactSearch({ q: "Jan" }, deps);
  const second = await executeContactSearch({ q: "Jan" }, deps);
  assert.deepEqual(second, first);
});
