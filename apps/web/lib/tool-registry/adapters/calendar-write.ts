/**
 * Centrale calendar write-adapter (TASK 23-design, §3–§6).
 *
 * Fail-closed keten: schema (additionalProperties: false, dedupeKey
 * verplicht, update ≥ 1 veld) → tenant-check → approval (APPROVED + binding
 * `calendar_write:{toolId}` + TTL) → client met idempotencyKey → audit
 * (approvalId + key-hash + appointmentId; nooit notes/contactdata).
 *
 * - idempotencyKey = sha256({toolId, tenantId, genormaliseerde payload});
 *   de client MOET de key respecteren (contract + testmatrix);
 * - cancel = HIGH → approval ALTIJD (spec riskLevel HIGH);
 * - update-gap: zonder client-updateAppointment → NOT_IMPLEMENTED
 *   (fail-closed — nooit simuleren);
 * - client-fout → gecontroleerde fout (geen ongecontroleerde retry).
 */

import { createHash } from "node:crypto";

import type { ApprovalGate } from "../../approvals/approval-gate.ts";
import {
  CalendarWriteClientError,
  type CalendarContactMethod,
  type CalendarWriteClient,
} from "../../calendar/write-client.ts";
import { isValidTimezone } from "./calendar.ts";

const MAX_200 = 200;
const MAX_320 = 320;
const MAX_2000 = 2000;
const MAX_64 = 64;

const CONTACT_METHODS: readonly CalendarContactMethod[] = ["phone", "video", "in_person"];

export interface CalendarWriteDeps {
  client: CalendarWriteClient;
  tenantId: string;
  approvalGate: ApprovalGate;
  now?: () => string;
  log?: (message: string) => void;
}

export interface CalendarWriteAudit {
  toolId: string;
  approvalId: string;
  idempotencyKeyHash: string;
  resultId: string | null;
  created: boolean;
}

export interface CalendarWriteToolResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  audit?: CalendarWriteAudit;
}

export type CalendarWriteToolId = "calendar_create" | "calendar_update" | "calendar_cancel";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function optionalString(value: unknown, max: number): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null; // ongeldig
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/** ISO-timestamp: parseerbaar en bounded (geen jaar-query's via het venster). */
function validTimestamp(value: string): boolean {
  if (value.length === 0 || value.length > MAX_64) return false;
  return !Number.isNaN(Date.parse(value));
}

function validContactMethod(value: unknown): value is CalendarContactMethod {
  return typeof value === "string" && (CONTACT_METHODS as readonly string[]).includes(value);
}

interface ValidatedInput {
  toolId: CalendarWriteToolId;
  payload: Record<string, unknown>;
  changes: Record<string, string | undefined>;
  dedupeKey: string;
  approvalId: string;
}

function validateWrite(toolId: CalendarWriteToolId, input: unknown): ValidatedInput | { error: string } {
  if (!isRecord(input)) return { error: "INVALID_WRITE_INPUT" };
  const allowed: Record<CalendarWriteToolId, Set<string>> = {
    calendar_create: new Set([
      "start", "end", "timezone", "contactMethod", "leadId", "conversationId",
      "name", "email", "notes", "dedupeKey", "approvalId",
    ]),
    calendar_update: new Set([
      "appointmentId", "start", "end", "timezone", "contactMethod", "dedupeKey", "approvalId",
    ]),
    calendar_cancel: new Set(["appointmentId", "reason", "dedupeKey", "approvalId"]),
  };
  for (const key of Object.keys(input)) {
    if (!allowed[toolId].has(key)) return { error: "INVALID_WRITE_INPUT" };
  }
  const dedupeKey = requiredString(input.dedupeKey, MAX_200);
  if (!dedupeKey) return { error: "INVALID_WRITE_INPUT" }; // idempotentie onmogelijk
  const approvalId = requiredString(input.approvalId, MAX_200);
  if (!approvalId) return { error: "INVALID_WRITE_INPUT" }; // approval verplicht

  if (toolId === "calendar_create") {
    const start = requiredString(input.start, MAX_64);
    const end = requiredString(input.end, MAX_64);
    const timezone = requiredString(input.timezone, MAX_64);
    const contactMethod = input.contactMethod;
    if (!start || !end || !timezone || !validTimestamp(start) || !validTimestamp(end)) {
      return { error: "INVALID_WRITE_INPUT" };
    }
    if (!isValidTimezone(timezone)) return { error: "INVALID_WRITE_INPUT" };
    if (!validContactMethod(contactMethod)) return { error: "INVALID_WRITE_INPUT" };
    if (Date.parse(end) <= Date.parse(start)) return { error: "INVALID_WRITE_INPUT" };

    const leadId = optionalString(input.leadId, MAX_200);
    const conversationId = optionalString(input.conversationId, MAX_200);
    const name = optionalString(input.name, MAX_200);
    const email = optionalString(input.email, MAX_320);
    const notes = optionalString(input.notes, MAX_2000);
    if (leadId === null || conversationId === null || name === null || email === null || notes === null) {
      return { error: "INVALID_WRITE_INPUT" };
    }
    return {
      toolId,
      payload: {
        start, end, timezone, contactMethod, leadId, conversationId, name, email, notes, dedupeKey,
      },
      changes: {},
      dedupeKey,
      approvalId,
    };
  }

  if (toolId === "calendar_update") {
    const appointmentId = requiredString(input.appointmentId, MAX_200);
    if (!appointmentId) return { error: "INVALID_WRITE_INPUT" };

    const start = optionalString(input.start, MAX_64);
    const end = optionalString(input.end, MAX_64);
    const timezone = optionalString(input.timezone, MAX_64);
    const contactMethod = input.contactMethod === undefined ? undefined : input.contactMethod;

    if (start === null || end === null || timezone === null) return { error: "INVALID_WRITE_INPUT" };
    if (start !== undefined && !validTimestamp(start)) return { error: "INVALID_WRITE_INPUT" };
    if (end !== undefined && !validTimestamp(end)) return { error: "INVALID_WRITE_INPUT" };
    if (timezone !== undefined && !isValidTimezone(timezone)) return { error: "INVALID_WRITE_INPUT" };
    if (contactMethod !== undefined && !validContactMethod(contactMethod)) {
      return { error: "INVALID_WRITE_INPUT" };
    }
    if (start !== undefined && end !== undefined && Date.parse(end) <= Date.parse(start)) {
      return { error: "INVALID_WRITE_INPUT" };
    }

    const changes: Record<string, string | undefined> = {
      start,
      end,
      timezone,
      contactMethod: validContactMethod(contactMethod) ? contactMethod : undefined,
    };
    if (Object.values(changes).every((v) => v === undefined)) {
      return { error: "INVALID_WRITE_INPUT" }; // minstens één veld
    }
    return { toolId, payload: { appointmentId, ...changes, dedupeKey }, changes, dedupeKey, approvalId };
  }

  // calendar_cancel
  const appointmentId = requiredString(input.appointmentId, MAX_200);
  if (!appointmentId) return { error: "INVALID_WRITE_INPUT" };
  const reason = optionalString(input.reason, MAX_200);
  if (reason === null) return { error: "INVALID_WRITE_INPUT" };
  return { toolId, payload: { appointmentId, reason, dedupeKey }, changes: {}, dedupeKey, approvalId };
}

export async function executeCalendarWrite(
  toolId: CalendarWriteToolId,
  input: unknown,
  deps: CalendarWriteDeps,
): Promise<CalendarWriteToolResult> {
  if (!deps.tenantId || deps.tenantId.trim().length === 0) {
    return { ok: false, error: "TENANT_REQUIRED" };
  }
  const validated = validateWrite(toolId, input);
  if ("error" in validated) {
    return { ok: false, error: validated.error };
  }

  // Update-gap (TASK 23 §4): zonder client-updateAppointment → NOT_IMPLEMENTED,
  // nooit simuleren. Fail-closed vóór approval (geen approval-consumptie).
  if (toolId === "calendar_update" && typeof deps.client.updateAppointment !== "function") {
    return { ok: false, error: "NOT_IMPLEMENTED" };
  }

  // Approval vóór de client (APPROVED + binding + TTL — fail-closed).
  const approval = await deps.approvalGate.check({
    approvalId: validated.approvalId,
    requestedAction: `calendar_write:${toolId}`,
    now: deps.now?.(),
  });
  if (!approval.allowed) {
    return { ok: false, error: approval.reason };
  }

  const idempotencyKey = sha256(
    JSON.stringify({ toolId, tenantId: deps.tenantId, payload: validated.payload }),
  );
  const log = deps.log ?? ((message: string) => console.info(`[calendar-write] ${message}`));

  try {
    let resultId: string | null = null;
    let created = false;

    if (toolId === "calendar_create") {
      const createdAppointment = await deps.client.createAppointment(
        {
          start: validated.payload.start as string,
          end: validated.payload.end as string,
          timezone: validated.payload.timezone as string,
          contactMethod: validated.payload.contactMethod as CalendarContactMethod,
          leadId: (validated.payload.leadId as string | undefined) ?? "",
          conversationId: (validated.payload.conversationId as string | undefined) ?? "",
          name: validated.payload.name as string | undefined,
          email: validated.payload.email as string | undefined,
          notes: validated.payload.notes as string | undefined,
          idempotencyKey,
        },
        { tenantId: deps.tenantId },
      );
      resultId = createdAppointment.appointmentId;
      created = createdAppointment.created;
      return {
        ok: true,
        value: {
          appointmentId: createdAppointment.appointmentId,
          status: createdAppointment.status,
          externalCalendarEventId: createdAppointment.externalCalendarEventId,
          created,
        },
        audit: {
          toolId,
          approvalId: validated.approvalId,
          idempotencyKeyHash: sha256(idempotencyKey),
          resultId,
          created,
        },
      };
    }

    if (toolId === "calendar_update") {
      const updated = await deps.client.updateAppointment(
        {
          appointmentId: validated.payload.appointmentId as string,
          changes: validated.changes as {
            start?: string;
            end?: string;
            timezone?: string;
            contactMethod?: CalendarContactMethod;
          },
          idempotencyKey,
        },
        { tenantId: deps.tenantId },
      );
      resultId = updated.appointmentId;
      return {
        ok: true,
        value: {
          appointmentId: updated.appointmentId,
          status: updated.status,
          externalCalendarEventId: updated.externalCalendarEventId,
        },
        audit: {
          toolId,
          approvalId: validated.approvalId,
          idempotencyKeyHash: sha256(idempotencyKey),
          resultId,
          created: false,
        },
      };
    }

    // calendar_cancel
    const cancelled = await deps.client.cancelAppointment(
      {
        appointmentId: validated.payload.appointmentId as string,
        reason: validated.payload.reason as string | undefined,
        idempotencyKey,
      },
      { tenantId: deps.tenantId },
    );
    resultId = cancelled.appointmentId;
    return {
      ok: true,
      value: { appointmentId: cancelled.appointmentId, status: cancelled.status },
      audit: {
        toolId,
        approvalId: validated.approvalId,
        idempotencyKeyHash: sha256(idempotencyKey),
        resultId,
        created: false,
      },
    };
  } catch (error) {
    // Bekende client-codes (bv. APPOINTMENT_NOT_FOUND, ALREADY_CANCELLED)
    // worden doorgegeven (design §6); alles anders → gecontroleerde fout.
    if (error instanceof CalendarWriteClientError) {
      return { ok: false, error: error.code };
    }
    const message = error instanceof Error ? error.message : String(error);
    log(`[calendar-write:${deps.tenantId}] ${toolId} failed: ${message.slice(0, 200)}`);
    return { ok: false, error: "CALENDAR_CLIENT_ERROR" };
  }
}
