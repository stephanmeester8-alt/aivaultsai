import assert from "node:assert/strict";
import { test } from "node:test";

import { createApprovalGate, type ApprovalSnapshot } from "../lib/approvals/approval-gate.ts";
import { executeEmailSend } from "../lib/tool-registry/adapters/email-send.ts";
import type { EmailSql } from "../lib/email/draft-repository.ts";
import type { EmailProvider } from "../lib/prospect-run/email-dispatcher.ts";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const DRAFT_ID = "draft_1";
const APPROVAL_ID = "apr_1";

interface StoreRow {
  draftId: string;
  tenantId: string;
  status: string;
  to: string;
  subject: string;
  body: string;
  optOutLine: string;
}

function makeStore(rows: StoreRow[] = []) {
  const store = new Map(rows.map((row) => [row.draftId, { ...row }]));
  const sql: EmailSql = async (strings, ...values) => {
    const query = strings.join("?");
    if (query.includes("SET status = 'SENT'")) {
      const [draftId, tenantId] = values as [string, string];
      const row = store.get(draftId);
      if (!row || row.tenantId !== tenantId) return [];
      if (row.status !== "DRAFT" && row.status !== "APPROVED") return [];
      row.status = "SENT";
      return [
        {
          draft_id: row.draftId,
          to_address: row.to,
          subject: row.subject,
          body: row.body,
          opt_out_line: row.optOutLine,
        },
      ];
    }
    if (query.includes("SET status = 'DRAFT'")) {
      const [draftId, tenantId] = values as [string, string];
      const row = store.get(draftId);
      if (row && row.tenantId === tenantId && row.status === "SENT") row.status = "DRAFT";
      return [];
    }
    if (query.includes("SELECT status FROM email_drafts")) {
      const [draftId, tenantId] = values as [string, string];
      const row = store.get(draftId);
      return row && row.tenantId === tenantId ? [{ status: row.status }] : [];
    }
    return [];
  };
  return { sql, store };
}

function makeDraftRow(overrides: Partial<StoreRow> = {}): StoreRow {
  return {
    draftId: DRAFT_ID,
    tenantId: TENANT_ID,
    status: "DRAFT",
    to: "info@acme.nl",
    subject: "Acme: reducing bottlenecks safely",
    body: "Hi there,\n\nbody text",
    optOutLine: "If this is not relevant, reply opt out.",
    ...overrides,
  };
}

function makeProvider(overrides: { throwOnSend?: boolean } = {}) {
  const calls: Array<{ to: string; subject: string; text: string; idempotencyKey: string }> = [];
  const provider: EmailProvider = {
    send: async (input) => {
      calls.push(input);
      if (overrides.throwOnSend) throw new Error("provider boom");
      return { providerMessageId: "msg_1" };
    },
  };
  return { provider, calls };
}

function makeApprovals(snapshots: Record<string, ApprovalSnapshot>) {
  const approvals = new Map(Object.entries(snapshots));
  const gate = createApprovalGate(async (id) => approvals.get(id) ?? null);
  return { gate };
}

function approvedSnapshot(overrides: Partial<ApprovalSnapshot> = {}): ApprovalSnapshot {
  return { status: "APPROVED", requestedAction: `email_send:${DRAFT_ID}`, expiresAt: null, ...overrides };
}

function makeDeps(overrides: Partial<Parameters<typeof executeEmailSend>[1]> = {}) {
  const store = makeStore([makeDraftRow()]);
  const { provider, calls } = makeProvider();
  const { gate } = makeApprovals({ [APPROVAL_ID]: approvedSnapshot() });
  return {
    deps: {
      sql: store.sql,
      tenantId: TENANT_ID,
      approvalGate: gate,
      provider,
      now: () => "2026-09-01T08:00:00.000Z",
      log: () => {},
      ...overrides,
    } as Parameters<typeof executeEmailSend>[1],
    store: store.store,
    calls,
  };
}

test("email-send: valide (APPROVED + draft + gates ok) → SENT", async () => {
  const { deps, calls, store } = makeDeps();
  const result = await executeEmailSend({ draftId: DRAFT_ID, approvalId: APPROVAL_ID }, deps);
  assert.equal(result.ok, true);
  assert.equal(result.value?.status, "SENT");
  assert.equal(result.value?.providerMessageId, "msg_1");
  assert.equal(calls.length, 1);
  // De dispatcher stelt de idempotencyKey zelf samen (runId:recipientHash) — bestaand contract.
  assert.ok(calls[0]!.idempotencyKey.startsWith(`email_send:${DRAFT_ID}:`));
  assert.equal(store.get(DRAFT_ID)?.status, "SENT");
  assert.match(result.audit!.recipientHash, /^[0-9a-f]{64}$/);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("info@acme.nl")); // PII: alleen recipientHash
});

test("email-send: approval ontbreekt → DENY, geen claim", async () => {
  const { deps, calls, store } = makeDeps();
  const result = await executeEmailSend({ draftId: DRAFT_ID, approvalId: "apr_onbekend" }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.error, "APPROVAL_NOT_FOUND");
  assert.equal(calls.length, 0);
  assert.equal(store.get(DRAFT_ID)?.status, "DRAFT");
});

test("email-send: approval PENDING / REJECTED → DENY", async () => {
  const { deps } = makeDeps();
  const pending = await executeEmailSend(
    { draftId: DRAFT_ID, approvalId: "apr_pending" },
    { ...deps, approvalGate: makeApprovals({ apr_pending: approvedSnapshot({ status: "PENDING" }) }).gate },
  );
  assert.equal(pending.error, "APPROVAL_NOT_APPROVED");
  const rejected = await executeEmailSend(
    { draftId: DRAFT_ID, approvalId: "apr_rejected" },
    { ...deps, approvalGate: makeApprovals({ apr_rejected: approvedSnapshot({ status: "REJECTED" }) }).gate },
  );
  assert.equal(rejected.error, "APPROVAL_REJECTED");
});

test("email-send: TTL verstreken → EXPIRED → DENY", async () => {
  const { deps } = makeDeps();
  const expiredGate = makeApprovals({
    apr_expired: approvedSnapshot({ expiresAt: "2026-09-01T07:00:00.000Z" }), // vóór now()
  }).gate;
  const result = await executeEmailSend(
    { draftId: DRAFT_ID, approvalId: "apr_expired" },
    { ...deps, approvalGate: expiredGate },
  );
  assert.equal(result.error, "APPROVAL_EXPIRED");
});

test("email-send: binding mismatch (andere requestedAction) → DENY", async () => {
  const { deps } = makeDeps();
  const mismatchGate = makeApprovals({
    apr_mismatch: approvedSnapshot({ requestedAction: "email_send:andere_draft" }),
  }).gate;
  const result = await executeEmailSend(
    { draftId: DRAFT_ID, approvalId: "apr_mismatch" },
    { ...deps, approvalGate: mismatchGate },
  );
  assert.equal(result.error, "APPROVAL_BINDING_MISMATCH");
});

test("email-send: draft niet gevonden → DRAFT_NOT_FOUND", async () => {
  const { deps, calls } = makeDeps();
  // Approval moet aan de gevraagde draft gebonden zijn (binding loopt vóór de claim),
  // anders is APPROVAL_BINDING_MISMATCH de correcte fail-closed uitkomst.
  const notFoundGate = makeApprovals({
    apr_999: approvedSnapshot({ requestedAction: "email_send:draft_999" }),
  }).gate;
  const result = await executeEmailSend(
    { draftId: "draft_999", approvalId: "apr_999" },
    { ...deps, approvalGate: notFoundGate },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "DRAFT_NOT_FOUND");
  assert.equal(calls.length, 0);
});

test("email-send: al SENT → ALREADY_SENT (claim faalt, geen tweede provider-call)", async () => {
  const { deps, calls } = makeDeps({});
  const first = await executeEmailSend({ draftId: DRAFT_ID, approvalId: APPROVAL_ID }, deps);
  assert.equal(first.value?.status, "SENT");
  const second = await executeEmailSend({ draftId: DRAFT_ID, approvalId: APPROVAL_ID }, deps);
  assert.equal(second.ok, false);
  assert.equal(second.error, "ALREADY_SENT");
  assert.equal(calls.length, 1); // maximaal één provider-call
});

test("email-send: dispatcher-gate BLOCKED → rollback naar DRAFT", async () => {
  const { deps, calls, store } = makeDeps();
  const result = await executeEmailSend(
    { draftId: DRAFT_ID, approvalId: APPROVAL_ID },
    { ...deps, gates: { optedOut: true } },
  );
  assert.equal(result.ok, true);
  assert.equal(result.value?.status, "BLOCKED");
  assert.ok(result.value?.reason);
  assert.equal(calls.length, 0);
  assert.equal(store.get(DRAFT_ID)?.status, "DRAFT"); // claim teruggedraaid
});

test("email-send: provider ontbreekt → BLOCKED (EMAIL_PROVIDER_NOT_CONFIGURED) + rollback", async () => {
  const { deps, store } = makeDeps();
  const result = await executeEmailSend(
    { draftId: DRAFT_ID, approvalId: APPROVAL_ID },
    { ...deps, provider: undefined },
  );
  assert.equal(result.value?.status, "BLOCKED");
  assert.equal(result.value?.reason, "EMAIL_PROVIDER_NOT_CONFIGURED");
  assert.equal(store.get(DRAFT_ID)?.status, "DRAFT");
});

test("email-send: provider-fout → PROVIDER_ERROR + rollback (geen auto-retry)", async () => {
  const { sql, store } = makeStore([makeDraftRow()]);
  const { provider } = makeProvider({ throwOnSend: true });
  const { gate } = makeApprovals({ [APPROVAL_ID]: approvedSnapshot() });
  const result = await executeEmailSend(
    { draftId: DRAFT_ID, approvalId: APPROVAL_ID },
    {
      sql,
      tenantId: TENANT_ID,
      approvalGate: gate,
      provider,
      now: () => "2026-09-01T08:00:00.000Z",
      log: () => {},
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "PROVIDER_ERROR");
  assert.equal(store.get(DRAFT_ID)?.status, "DRAFT"); // claim teruggedraaid
});

test("email-send: ongeldige input → INVALID_SEND_INPUT (fail-closed)", async () => {
  const { deps } = makeDeps();
  assert.equal((await executeEmailSend({ draftId: DRAFT_ID }, deps)).error, "INVALID_SEND_INPUT");
  assert.equal(
    (await executeEmailSend({ draftId: DRAFT_ID, approvalId: APPROVAL_ID, extra: 1 }, deps)).error,
    "INVALID_SEND_INPUT",
  );
  assert.equal((await executeEmailSend("geen-object", deps)).error, "INVALID_SEND_INPUT");
});
