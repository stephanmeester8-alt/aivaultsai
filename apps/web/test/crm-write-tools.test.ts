import assert from "node:assert/strict";
import { test } from "node:test";

import { createApprovalGate, type ApprovalSnapshot } from "../lib/approvals/approval-gate.ts";
import { executeCrmWrite, type CrmWriteToolId } from "../lib/tool-registry/adapters/crm-write.ts";
import type { CrmWriteClient } from "../lib/crm/write-client.ts";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const APPROVAL_ID = "apr_crm_1";

function approvedSnapshot(requestedAction: string, overrides: Partial<ApprovalSnapshot> = {}): ApprovalSnapshot {
  return { status: "APPROVED", requestedAction, expiresAt: null, ...overrides };
}

function makeApprovalGate(snapshots: Record<string, ApprovalSnapshot>) {
  const approvals = new Map(Object.entries(snapshots));
  return createApprovalGate(async (id) => approvals.get(id) ?? null);
}

/** Fake client die de idempotencyKey respecteert (contract-eis). */
function makeWriteClient() {
  const createdKeys = new Map<string, string>(); // key → recordId
  const calls: string[] = [];
  const client: CrmWriteClient = {
    createContact: async (input) => {
      calls.push(`createContact:${input.idempotencyKey}`);
      const existing = createdKeys.get(input.idempotencyKey);
      if (existing) return { contactId: existing, created: false };
      const id = `contact_${createdKeys.size + 1}`;
      createdKeys.set(input.idempotencyKey, id);
      return { contactId: id, created: true };
    },
    updateContact: async (input) => {
      calls.push(`updateContact:${input.idempotencyKey}`);
      return { contactId: input.contactId };
    },
    createLead: async (input) => {
      calls.push(`createLead:${input.idempotencyKey}`);
      const existing = createdKeys.get(input.idempotencyKey);
      if (existing) return { leadId: existing, created: false };
      const id = `lead_${createdKeys.size + 1}`;
      createdKeys.set(input.idempotencyKey, id);
      return { leadId: id, created: true };
    },
    updateLead: async (input) => {
      calls.push(`updateLead:${input.idempotencyKey}`);
      return { leadId: input.leadId };
    },
  };
  return { client, calls };
}

function makeDeps(
  toolId: CrmWriteToolId,
  overrides: Partial<Parameters<typeof executeCrmWrite>[2]> = {},
) {
  const { client, calls } = makeWriteClient();
  const gate = makeApprovalGate({ [APPROVAL_ID]: approvedSnapshot(`crm_write:${toolId}`) });
  return {
    deps: {
      client,
      tenantId: TENANT_ID,
      approvalGate: gate,
      now: () => "2026-09-01T08:00:00.000Z",
      log: () => {},
      ...overrides,
    } as Parameters<typeof executeCrmWrite>[2],
    calls,
  };
}

test("crm write: contact_create valide → contactId + created:true; idempotent herhaal → created:false", async () => {
  const { deps, calls } = makeDeps("contact_create");
  const first = await executeCrmWrite(
    "contact_create",
    { name: "Jan Jansen", email: "jan@acme.nl", dedupeKey: "key-1", approvalId: APPROVAL_ID },
    deps,
  );
  assert.equal(first.ok, true);
  assert.equal((first.value as { created: boolean }).created, true);
  assert.ok((first.value as { resultId: string }).resultId);

  // Zelfde payload + zelfde approval → zelfde idempotencyKey → created:false.
  const second = await executeCrmWrite(
    "contact_create",
    { name: "Jan Jansen", email: "jan@acme.nl", dedupeKey: "key-1", approvalId: APPROVAL_ID },
    deps,
  );
  assert.equal(second.ok, true);
  assert.equal((second.value as { created: boolean }).created, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]); // zelfde key
});

test("crm write: lead_create / update-paden werken", async () => {
  const created = await executeCrmWrite(
    "lead_create",
    { company: "Acme BV", status: "OPEN", dedupeKey: "lead-1", approvalId: APPROVAL_ID },
    makeDeps("lead_create").deps,
  );
  assert.equal(created.ok, true);
  assert.equal((created.value as { created: boolean }).created, true);

  const updated = await executeCrmWrite(
    "lead_update",
    { leadId: "lead_1", status: "QUALIFIED", dedupeKey: "lead-1-upd", approvalId: APPROVAL_ID },
    makeDeps("lead_update").deps,
  );
  assert.equal(updated.ok, true);
  assert.equal((updated.value as { resultId: string }).resultId, "lead_1");
});

test("crm write: ongeldige input → DENY (fail-closed)", async () => {
  const { deps } = makeDeps("contact_create");
  // ontbrekende approvalId
  assert.equal(
    (await executeCrmWrite("contact_create", { name: "A", email: "a@b.nl", dedupeKey: "k" }, deps)).error,
    "INVALID_WRITE_INPUT",
  );
  // ontbrekende dedupeKey
  assert.equal(
    (await executeCrmWrite("contact_create", { name: "A", email: "a@b.nl", approvalId: APPROVAL_ID }, deps)).error,
    "INVALID_WRITE_INPUT",
  );
  // veldsmokkel
  assert.equal(
    (await executeCrmWrite(
      "contact_create",
      { name: "A", email: "a@b.nl", dedupeKey: "k", approvalId: APPROVAL_ID, delete: true },
      deps,
    )).error,
    "INVALID_WRITE_INPUT",
  );
  // update zonder velden
  assert.equal(
    (await executeCrmWrite(
      "contact_update",
      { contactId: "c1", dedupeKey: "k", approvalId: APPROVAL_ID },
      deps,
    )).error,
    "INVALID_WRITE_INPUT",
  );
});

test("crm write: approval ontbreekt / PENDING / REJECTED / binding-mismatch → DENY", async () => {
  const { deps } = makeDeps("contact_create");
  const input = { name: "A", email: "a@b.nl", dedupeKey: "k", approvalId: APPROVAL_ID };

  const notFound = await executeCrmWrite(
    "contact_create",
    { ...input, approvalId: "apr_x" },
    deps,
  );
  assert.equal(notFound.error, "APPROVAL_NOT_FOUND");

  const pending = await executeCrmWrite(
    "contact_create",
    input,
    { ...deps, approvalGate: makeApprovalGate({ [APPROVAL_ID]: approvedSnapshot("crm_write:contact_create", { status: "PENDING" }) }) },
  );
  assert.equal(pending.error, "APPROVAL_NOT_APPROVED");

  const rejected = await executeCrmWrite(
    "contact_create",
    input,
    { ...deps, approvalGate: makeApprovalGate({ [APPROVAL_ID]: approvedSnapshot("crm_write:contact_create", { status: "REJECTED" }) }) },
  );
  assert.equal(rejected.error, "APPROVAL_REJECTED");

  const mismatch = await executeCrmWrite(
    "contact_create",
    input,
    { ...deps, approvalGate: makeApprovalGate({ [APPROVAL_ID]: approvedSnapshot("crm_write:lead_create") }) },
  );
  assert.equal(mismatch.error, "APPROVAL_BINDING_MISMATCH");
});

test("crm write: TTL verstreken → EXPIRED", async () => {
  const { deps } = makeDeps("contact_create");
  const expiredGate = makeApprovalGate({
    [APPROVAL_ID]: approvedSnapshot("crm_write:contact_create", { expiresAt: "2026-09-01T07:00:00.000Z" }),
  });
  const result = await executeCrmWrite(
    "contact_create",
    { name: "A", email: "a@b.nl", dedupeKey: "k", approvalId: APPROVAL_ID },
    { ...deps, approvalGate: expiredGate },
  );
  assert.equal(result.error, "APPROVAL_EXPIRED");
});

test("crm write: tenantId ontbreekt → DENY", async () => {
  const { deps } = makeDeps("contact_create");
  const result = await executeCrmWrite(
    "contact_create",
    { name: "A", email: "a@b.nl", dedupeKey: "k", approvalId: APPROVAL_ID },
    { ...deps, tenantId: " " },
  );
  assert.equal(result.error, "TENANT_REQUIRED");
});

test("crm write: client-fout → gecontroleerde fout (geen retry)", async () => {
  const { deps } = makeDeps("contact_create");
  const failingClient: CrmWriteClient = {
    createContact: async () => {
      throw new Error("crm write kapot");
    },
    updateContact: async () => {
      throw new Error("kapot");
    },
    createLead: async () => {
      throw new Error("kapot");
    },
    updateLead: async () => {
      throw new Error("kapot");
    },
  };
  const result = await executeCrmWrite(
    "contact_create",
    { name: "A", email: "a@b.nl", dedupeKey: "k", approvalId: APPROVAL_ID },
    { ...deps, client: failingClient },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "CRM_CLIENT_ERROR");
});

test("crm write: audit bevat approvalId + key-hash, nooit payload", async () => {
  const { deps } = makeDeps("contact_create");
  const result = await executeCrmWrite(
    "contact_create",
    { name: "Jan Jansen", email: "jan@acme.nl", dedupeKey: "key-secret-1", approvalId: APPROVAL_ID },
    deps,
  );
  assert.ok(result.audit);
  assert.equal(result.audit.approvalId, APPROVAL_ID);
  assert.match(result.audit.idempotencyKeyHash, /^[0-9a-f]{64}$/);
  const serialized = JSON.stringify(result.audit);
  assert.ok(!serialized.includes("jan@acme.nl"));
  assert.ok(!serialized.includes("key-secret-1"));
});
