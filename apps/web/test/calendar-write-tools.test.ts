import assert from "node:assert/strict";
import { test } from "node:test";

import { createApprovalGate, type ApprovalSnapshot } from "../lib/approvals/approval-gate.ts";
import {
  CalendarWriteClientError,
  type CalendarWriteClient,
} from "../lib/calendar/write-client.ts";
import {
  executeCalendarWrite,
  type CalendarWriteToolId,
} from "../lib/tool-registry/adapters/calendar-write.ts";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const APPROVAL_ID = "apr_cal_1";

const CREATE_INPUT = {
  start: "2026-09-10T09:00:00.000Z",
  end: "2026-09-10T09:30:00.000Z",
  timezone: "Europe/Amsterdam",
  contactMethod: "video",
  leadId: "lead_1",
  conversationId: "conv_1",
  notes: "privé notitie",
  dedupeKey: "cal-create-1",
  approvalId: APPROVAL_ID,
};

function approvedSnapshot(requestedAction: string, overrides: Partial<ApprovalSnapshot> = {}): ApprovalSnapshot {
  return { status: "APPROVED", requestedAction, expiresAt: null, ...overrides };
}

function makeApprovalGate(snapshots: Record<string, ApprovalSnapshot>) {
  const approvals = new Map(Object.entries(snapshots));
  return createApprovalGate(async (id) => approvals.get(id) ?? null);
}

/** Fake client die de idempotencyKey respecteert (contract-eis) + cancel-guard. */
function makeWriteClient() {
  const createdKeys = new Map<string, string>(); // key → appointmentId
  const cancelled = new Set<string>(); // appointmentId → al CANCELLED
  const calls: string[] = [];
  const client: CalendarWriteClient = {
    createAppointment: async (input) => {
      calls.push(`create:${input.idempotencyKey}`);
      const existing = createdKeys.get(input.idempotencyKey);
      if (existing) {
        return { appointmentId: existing, status: "CONFIRMED", externalCalendarEventId: "ext_1", created: false };
      }
      const id = `appt_${createdKeys.size + 1}`;
      createdKeys.set(input.idempotencyKey, id);
      return { appointmentId: id, status: "CONFIRMED", externalCalendarEventId: "ext_1", created: true };
    },
    updateAppointment: async (input) => {
      calls.push(`update:${input.idempotencyKey}`);
      return { appointmentId: input.appointmentId, status: "CONFIRMED", externalCalendarEventId: "ext_1" };
    },
    // Conditional-update-simulatie: eerste cancel wint; dubbel cancel → DENY.
    cancelAppointment: async (input) => {
      calls.push(`cancel:${input.idempotencyKey}`);
      if (cancelled.has(input.appointmentId)) {
        throw new CalendarWriteClientError("ALREADY_CANCELLED", "appointment already cancelled");
      }
      await new Promise((resolve) => setTimeout(resolve, 5)); // racer-venster
      if (cancelled.has(input.appointmentId)) {
        throw new CalendarWriteClientError("ALREADY_CANCELLED", "appointment already cancelled");
      }
      cancelled.add(input.appointmentId);
      return { appointmentId: input.appointmentId, status: "CANCELLED" };
    },
  };
  return { client, calls };
}

function makeDeps(
  toolId: CalendarWriteToolId,
  overrides: Partial<Parameters<typeof executeCalendarWrite>[2]> = {},
) {
  const { client, calls } = makeWriteClient();
  const gate = makeApprovalGate({ [APPROVAL_ID]: approvedSnapshot(`calendar_write:${toolId}`) });
  return {
    deps: {
      client,
      tenantId: TENANT_ID,
      approvalGate: gate,
      now: () => "2026-09-01T08:00:00.000Z",
      log: () => {},
      ...overrides,
    } as Parameters<typeof executeCalendarWrite>[2],
    calls,
  };
}

test("calendar write: create valide → appointmentId + created:true; idempotent herhaal → created:false", async () => {
  const { deps, calls } = makeDeps("calendar_create");
  const first = await executeCalendarWrite("calendar_create", CREATE_INPUT, deps);
  assert.equal(first.ok, true);
  const firstValue = first.value as { appointmentId: string; status: string; externalCalendarEventId: string; created: boolean };
  assert.equal(firstValue.created, true);
  assert.ok(firstValue.appointmentId);
  assert.equal(firstValue.status, "CONFIRMED");
  assert.equal(firstValue.externalCalendarEventId, "ext_1");

  // Zelfde payload + zelfde approval → zelfde idempotencyKey → created:false.
  const second = await executeCalendarWrite("calendar_create", CREATE_INPUT, deps);
  assert.equal(second.ok, true);
  assert.equal((second.value as { created: boolean }).created, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1]); // zelfde key
});

test("calendar write: update met minstens één veld → gewijzigd; zonder velden → DENY", async () => {
  const { deps } = makeDeps("calendar_update");
  const updated = await executeCalendarWrite(
    "calendar_update",
    { appointmentId: "appt_1", start: "2026-09-11T10:00:00.000Z", dedupeKey: "cal-upd-1", approvalId: APPROVAL_ID },
    deps,
  );
  assert.equal(updated.ok, true);
  assert.equal((updated.value as { appointmentId: string }).appointmentId, "appt_1");

  const noChanges = await executeCalendarWrite(
    "calendar_update",
    { appointmentId: "appt_1", dedupeKey: "cal-upd-2", approvalId: APPROVAL_ID },
    deps,
  );
  assert.equal(noChanges.error, "INVALID_WRITE_INPUT");
});

test("calendar write: update zonder provider-implementatie → NOT_IMPLEMENTED", async () => {
  const { client, calls } = makeWriteClient();
  // Client zonder updateAppointment: de update-gap (design §4) faalt closed.
  const { updateAppointment, ...clientWithoutUpdate } = client;
  void updateAppointment;
  const deps = makeDeps("calendar_update", { client: clientWithoutUpdate as CalendarWriteClient }).deps;
  const result = await executeCalendarWrite(
    "calendar_update",
    { appointmentId: "appt_1", start: "2026-09-11T10:00:00.000Z", dedupeKey: "cal-upd-3", approvalId: APPROVAL_ID },
    deps,
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "NOT_IMPLEMENTED");
  assert.equal(calls.length, 0); // geen approval-consumptie, geen client-call
});

test("calendar write: cancel valide → CANCELLED; dubbel cancel → DENY (ALREADY_CANCELLED)", async () => {
  const { deps } = makeDeps("calendar_cancel");
  const first = await executeCalendarWrite(
    "calendar_cancel",
    { appointmentId: "appt_1", reason: "klant verhinderd", dedupeKey: "cal-cancel-1", approvalId: APPROVAL_ID },
    deps,
  );
  assert.equal(first.ok, true);
  assert.equal((first.value as { status: string }).status, "CANCELLED");

  // Zelfde afspraak nogmaals cancelen → geen tweede side effect.
  const second = await executeCalendarWrite(
    "calendar_cancel",
    { appointmentId: "appt_1", dedupeKey: "cal-cancel-2", approvalId: APPROVAL_ID },
    deps,
  );
  assert.equal(second.ok, false);
  assert.equal(second.error, "ALREADY_CANCELLED");
});

test("calendar write: concurrente cancels → één CANCELLED, rest DENY", async () => {
  const { deps } = makeDeps("calendar_cancel");
  const results = await Promise.all([
    executeCalendarWrite(
      "calendar_cancel",
      { appointmentId: "appt_9", dedupeKey: "cal-conc-1", approvalId: APPROVAL_ID },
      deps,
    ),
    executeCalendarWrite(
      "calendar_cancel",
      { appointmentId: "appt_9", dedupeKey: "cal-conc-2", approvalId: APPROVAL_ID },
      deps,
    ),
  ]);
  const okCount = results.filter((r) => r.ok).length;
  assert.equal(okCount, 1); // precies één side effect
  assert.equal(results.filter((r) => r.error === "ALREADY_CANCELLED").length, 1);
});

test("calendar write: cancel van niet-bestaande afspraak → DENY (APPOINTMENT_NOT_FOUND)", async () => {
  const { client, calls } = makeWriteClient();
  const notFoundClient: CalendarWriteClient = {
    ...client,
    cancelAppointment: async () => {
      calls.push("cancel:not-found");
      throw new CalendarWriteClientError("APPOINTMENT_NOT_FOUND", "appointment does not exist");
    },
  };
  const deps = makeDeps("calendar_cancel", { client: notFoundClient }).deps;
  const result = await executeCalendarWrite(
    "calendar_cancel",
    { appointmentId: "nope", dedupeKey: "cal-nf-1", approvalId: APPROVAL_ID },
    deps,
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "APPOINTMENT_NOT_FOUND");
  assert.equal(calls.length, 1); // één poging — geen retry
});

test("calendar write: ongeldige input → DENY (fail-closed)", async () => {
  const { deps } = makeDeps("calendar_create");
  // ontbrekende approvalId / dedupeKey
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, approvalId: undefined }, deps)).error,
    "INVALID_WRITE_INPUT",
  );
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, dedupeKey: undefined }, deps)).error,
    "INVALID_WRITE_INPUT",
  );
  // onbekend veld
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, extra: 1 }, deps)).error,
    "INVALID_WRITE_INPUT",
  );
  // bounds: te lange notes / ongeldige contactMethod / ongeldige timezone
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, notes: "x".repeat(2001) }, deps)).error,
    "INVALID_WRITE_INPUT",
  );
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, contactMethod: "smoke" }, deps)).error,
    "INVALID_WRITE_INPUT",
  );
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, timezone: "Amsterdam" }, deps)).error,
    "INVALID_WRITE_INPUT",
  );
  // end <= start / ongeldige timestamp
  assert.equal(
    (await executeCalendarWrite(
      "calendar_create",
      { ...CREATE_INPUT, start: "2026-09-10T10:00:00.000Z", end: "2026-09-10T09:00:00.000Z" },
      deps,
    )).error,
    "INVALID_WRITE_INPUT",
  );
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, start: "gisteren" }, deps)).error,
    "INVALID_WRITE_INPUT",
  );
});

test("calendar write: tenantId ontbreekt → DENY (geen globale calls)", async () => {
  const { client } = makeWriteClient();
  const gate = makeApprovalGate({ [APPROVAL_ID]: approvedSnapshot("calendar_write:calendar_create") });
  const result = await executeCalendarWrite("calendar_create", CREATE_INPUT, {
    client,
    tenantId: "  ",
    approvalGate: gate,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "TENANT_REQUIRED");
});

test("calendar write: approval ontbreekt / PENDING / REJECTED / EXPIRED → DENY", async () => {
  const { client } = makeWriteClient();
  const snapshots = {
    pending: { status: "PENDING" as const, requestedAction: "calendar_write:calendar_create", expiresAt: null },
    rejected: { status: "REJECTED" as const, requestedAction: "calendar_write:calendar_create", expiresAt: null },
    expired: { status: "APPROVED" as const, requestedAction: "calendar_write:calendar_create", expiresAt: "2026-08-01T00:00:00.000Z" },
    wrongBinding: { status: "APPROVED" as const, requestedAction: "calendar_write:calendar_cancel", expiresAt: null },
  };
  const gate = makeApprovalGate(snapshots);
  const now = () => "2026-09-01T08:00:00.000Z";
  const deps = { client, tenantId: TENANT_ID, approvalGate: gate, now, log: () => {} };

  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, approvalId: "unknown" }, deps)).error,
    "APPROVAL_NOT_FOUND",
  );
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, approvalId: "pending" }, deps)).error,
    "APPROVAL_NOT_APPROVED",
  );
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, approvalId: "rejected" }, deps)).error,
    "APPROVAL_REJECTED",
  );
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, approvalId: "expired" }, deps)).error,
    "APPROVAL_EXPIRED",
  );
  assert.equal(
    (await executeCalendarWrite("calendar_create", { ...CREATE_INPUT, approvalId: "wrongBinding" }, deps)).error,
    "APPROVAL_BINDING_MISMATCH",
  );
});

test("calendar write: audit bevat approvalId + key-hash + appointmentId, nooit notes/contactdata", async () => {
  const { deps } = makeDeps("calendar_create");
  const result = await executeCalendarWrite("calendar_create", CREATE_INPUT, deps);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.audit!).sort(), [
    "approvalId",
    "created",
    "idempotencyKeyHash",
    "resultId",
    "toolId",
  ]);
  assert.equal(result.audit?.approvalId, APPROVAL_ID);
  assert.match(result.audit!.idempotencyKeyHash, /^[0-9a-f]{64}$/);
  assert.ok(result.audit?.resultId);
  // nooit notes/namen/e-mails in de audit
  assert.equal(JSON.stringify(result.audit).includes("privé notitie"), false);
  assert.equal(JSON.stringify(result.audit).includes("video"), false);
});

test("calendar write: client-fout → gecontroleerde fout, geen auto-retry", async () => {
  const { client } = makeWriteClient();
  let attempts = 0;
  const failingClient: CalendarWriteClient = {
    ...client,
    createAppointment: async () => {
      attempts += 1;
      throw new Error("provider kapot");
    },
  };
  const deps = makeDeps("calendar_create", { client: failingClient }).deps;
  const result = await executeCalendarWrite("calendar_create", CREATE_INPUT, deps);
  assert.equal(result.ok, false);
  assert.equal(result.error, "CALENDAR_CLIENT_ERROR");
  assert.equal(attempts, 1); // precies één poging — geen retry
});
