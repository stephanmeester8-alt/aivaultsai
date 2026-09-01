import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createEmployeeApprovalId,
  createEmployeeSendApprovalGate,
  createInMemoryEmployeeApprovalStore,
} from "../lib/approvals/employee-approval.ts";
import { executeEmailSend } from "../lib/tool-registry/adapters/email-send.ts";
import { createToolRegistryV2 } from "../lib/tool-registry/registry.ts";
import { TOOL_SPECS, EMAIL_SEND } from "../lib/tool-registry/tools.ts";
import type { EmailSql } from "../lib/email/draft-repository.ts";
import type { EmailProvider } from "../lib/prospect-run/email-dispatcher.ts";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const DRAFT_ID = "draft_1";
const ACTION_ID = "action_1";

interface DraftRow {
  draft_id: string;
  tenant_id: string;
  action_id: string | null;
  status: string;
  to_address: string;
  subject: string;
  body: string;
  opt_out_line: string;
}

function makeDraftStore() {
  const store = new Map<string, DraftRow>();
  const put = (row: DraftRow) => store.set(row.draft_id, row);
  const sql: EmailSql = async (strings, ...values) => {
    const query = strings.join("?");
    if (query.includes("SELECT action_id FROM email_drafts")) {
      const [draftId, tenantId] = values as [string, string];
      const row = store.get(draftId);
      if (!row || row.tenant_id !== tenantId) return [];
      return [{ action_id: row.action_id }];
    }
    if (query.includes("SET status = 'SENT'")) {
      const [draftId, tenantId] = values as [string, string];
      const row = store.get(draftId);
      if (!row || row.tenant_id !== tenantId) return [];
      if (row.status !== "DRAFT" && row.status !== "APPROVED") return [];
      row.status = "SENT";
      return [
        {
          draft_id: row.draft_id,
          to_address: row.to_address,
          subject: row.subject,
          body: row.body,
          opt_out_line: row.opt_out_line,
        },
      ];
    }
    if (query.includes("SET status = 'DRAFT'")) {
      const [draftId, tenantId] = values as [string, string];
      const row = store.get(draftId);
      if (row && row.tenant_id === tenantId && row.status === "SENT") row.status = "DRAFT";
      return [];
    }
    if (query.includes("SELECT status FROM email_drafts")) {
      const [draftId, tenantId] = values as [string, string];
      const row = store.get(draftId);
      return row && row.tenant_id === tenantId ? [{ status: row.status }] : [];
    }
    return [];
  };
  return { sql, put, store };
}

function makeDraftRow(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    draft_id: DRAFT_ID,
    tenant_id: TENANT_ID,
    action_id: ACTION_ID,
    status: "DRAFT",
    to_address: "info@acme.nl",
    subject: "Acme: reducing bottlenecks safely",
    body: "Hi there",
    opt_out_line: "reply opt out",
    ...overrides,
  };
}

async function makeApprovedEmployeeApproval(
  store: ReturnType<typeof createInMemoryEmployeeApprovalStore>,
  actionId: string,
  approvalId: string,
) {
  await store.create({
    sessionId: "sess-1",
    actionId,
    requestedBy: "autonomous-employee",
    requestedAction: `email_send:${actionId}`,
    riskLevel: "HIGH",
    now: "2026-09-01T08:00:00.000Z",
  });
  await store.approve(approvalId, "human@owner.nl");
}

test("employee send-route: brug-gate vertaalt draftId → actionId en laat employee-approval door", async () => {
  const { sql, put } = makeDraftStore();
  put(makeDraftRow());
  const store = createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z");
  const approvalId = createEmployeeApprovalId("sess-1", ACTION_ID);
  await makeApprovedEmployeeApproval(store, ACTION_ID, approvalId);

  const gate = createEmployeeSendApprovalGate(store, sql, TENANT_ID);
  // Send-adapter-contract: requestedAction = email_send:{draftId}
  assert.deepEqual(await gate.check({ approvalId, requestedAction: `email_send:${DRAFT_ID}` }), {
    allowed: true,
  });
});

test("employee send-route: PENDING / REJECTED / EXPIRED → DENY", async () => {
  const { sql, put } = makeDraftStore();
  put(makeDraftRow());
  const store = createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z");
  const approvalId = createEmployeeApprovalId("sess-1", ACTION_ID);

  // PENDING
  await store.create({
    sessionId: "sess-1",
    actionId: ACTION_ID,
    requestedBy: "autonomous-employee",
    requestedAction: `email_send:${ACTION_ID}`,
    riskLevel: "HIGH",
  });
  const gate = createEmployeeSendApprovalGate(store, sql, TENANT_ID);
  const pending = await gate.check({ approvalId, requestedAction: `email_send:${DRAFT_ID}` });
  assert.equal(pending.allowed, false);
  if (!pending.allowed) assert.equal(pending.reason, "APPROVAL_NOT_APPROVED");

  // REJECTED
  await store.reject(approvalId, "human@owner.nl");
  const rejected = await gate.check({ approvalId, requestedAction: `email_send:${DRAFT_ID}` });
  if (!rejected.allowed) assert.equal(rejected.reason, "APPROVAL_REJECTED");

  // EXPIRED (nieuwe approval met TTL in het verleden)
  const expiredStore = createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z");
  const expiredId = createEmployeeApprovalId("sess-1", "action_expired");
  await expiredStore.create({
    sessionId: "sess-1",
    actionId: "action_expired",
    requestedBy: "autonomous-employee",
    requestedAction: "email_send:action_expired",
    riskLevel: "HIGH",
    expiresAt: "2026-09-01T07:00:00.000Z",
  });
  const expiredGate = createEmployeeSendApprovalGate(expiredStore, sql, TENANT_ID);
  const expired = await expiredGate.check({
    approvalId: expiredId,
    requestedAction: `email_send:${DRAFT_ID}`,
  });
  // TTL-check komt vóór de binding → EXPIRED.
  assert.equal(expired.allowed, false);
  if (!expired.allowed) assert.equal(expired.reason, "APPROVAL_EXPIRED");
});

test("employee send-route: draft zonder actionId / onbekende approval / verkeerde action → DENY", async () => {
  const { sql, put } = makeDraftStore();
  put(makeDraftRow({ action_id: null }));
  const store = createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z");
  const approvalId = createEmployeeApprovalId("sess-1", ACTION_ID);
  await makeApprovedEmployeeApproval(store, ACTION_ID, approvalId);
  const gate = createEmployeeSendApprovalGate(store, sql, TENANT_ID);

  // Draft zonder actionId → DRAFT_NOT_FOUND (kan niet aan een approval gebonden worden)
  const noAction = await gate.check({ approvalId, requestedAction: `email_send:${DRAFT_ID}` });
  assert.equal(noAction.allowed, false);
  if (!noAction.allowed) assert.equal(noAction.reason, "DRAFT_NOT_FOUND");

  // Herstel de draft met action_1 voor de approval-checks.
  put(makeDraftRow({ action_id: ACTION_ID }));

  // Onbekende approval
  const unknown = await gate.check({ approvalId: "apr_x", requestedAction: `email_send:${DRAFT_ID}` });
  if (!unknown.allowed) assert.equal(unknown.reason, "APPROVAL_NOT_FOUND");

  // Approval voor andere action → binding mismatch (draft weer met action_1)
  put(makeDraftRow({ action_id: ACTION_ID }));
  const otherApproval = createEmployeeApprovalId("sess-1", "action_andere");
  await makeApprovedEmployeeApproval(store, "action_andere", otherApproval);
  const mismatch = await gate.check({ approvalId: otherApproval, requestedAction: `email_send:${DRAFT_ID}` });
  if (!mismatch.allowed) assert.equal(mismatch.reason, "APPROVAL_BINDING_MISMATCH");

  // Niet-email_send requestedAction
  const invalid = await gate.check({ approvalId, requestedAction: "iets_anders" });
  if (!invalid.allowed) assert.equal(invalid.reason, "APPROVAL_BINDING_MISMATCH");
});

test("registry: enabledOverrides kunnen email_send inschakelen; default blijft uit (fail-closed)", () => {
  const registry = createToolRegistryV2(TOOL_SPECS);
  assert.equal(registry.isEnabled("email_send"), false); // spec default: uit

  const enabledRegistry = createToolRegistryV2(TOOL_SPECS, {
    enabledOverrides: { email_send: true },
  });
  assert.equal(enabledRegistry.isEnabled("email_send"), true);
  assert.equal(enabledRegistry.approvalRequired("email_send"), true); // approval blijft verplicht
  assert.equal(enabledRegistry.isEnabled("email_draft"), true); // ongerelateerd onveranderd
  assert.equal(enabledRegistry.isEnabled("onbekend_id"), false); // override op onbekende id → niets
});

test("registry: tenantPolicy OFF wint altijd over een enabledOverride", () => {
  const offSpec = { ...EMAIL_SEND, id: "email_send_off", tenantPolicy: "OFF" as const };
  const registry = createToolRegistryV2([offSpec], { enabledOverrides: { email_send_off: true } });
  assert.equal(registry.isEnabled("email_send_off"), false);
});

test("employee send-route e2e: employee-approval → brug-gate → email_send → SENT", async () => {
  const { sql, put, store: draftStore } = makeDraftStore();
  put(makeDraftRow());
  const store = createInMemoryEmployeeApprovalStore(() => "2026-09-01T08:00:00.000Z");
  const approvalId = createEmployeeApprovalId("sess-1", ACTION_ID);
  await makeApprovedEmployeeApproval(store, ACTION_ID, approvalId);

  let sent = 0;
  const provider: EmailProvider = {
    send: async () => {
      sent += 1;
      return { providerMessageId: "msg-1" };
    },
  };

  const gate = createEmployeeSendApprovalGate(store, sql, TENANT_ID);
  const result = await executeEmailSend(
    { draftId: DRAFT_ID, approvalId },
    { sql, tenantId: TENANT_ID, approvalGate: gate, provider, now: () => "2026-09-01T08:00:00.000Z", log: () => {} },
  );
  assert.equal(result.ok, true);
  assert.equal(result.value?.status, "SENT");
  assert.equal(sent, 1);
  assert.equal(draftStore.get(DRAFT_ID)?.status, "SENT");

  // Tweede poging: claim faalt → ALREADY_SENT (maximaal één provider-call).
  const second = await executeEmailSend(
    { draftId: DRAFT_ID, approvalId },
    { sql, tenantId: TENANT_ID, approvalGate: gate, provider, now: () => "2026-09-01T08:00:00.000Z", log: () => {} },
  );
  assert.equal(second.error, "ALREADY_SENT");
  assert.equal(sent, 1);
});
