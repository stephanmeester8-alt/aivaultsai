/**
 * Centrale calendar read-only adapter (TASK 22-design, §4–§5).
 *
 * Hergebruik, geen herbouw (REGEL 2): de adapter roept de BESTAANDE
 * `CalendarProvider.getAvailability` aan; `createAppointment`/`cancelAppointment`
 * zijn structureel buiten bereik (geen pad — write/cancel volgen in TASK 23).
 *
 * Fail-closed:
 * - schema-validatie (additionalProperties: false) → DENY;
 * - venster > 14 dagen of end < start → DENY (INVALID_WINDOW, geen paginatie-loops);
 * - ongeldige datum (bv. 2026-02-31) / ongeldige timezone → DENY;
 * - tenantId verplicht per call (geen globale calls);
 * - provider-fout → gecontroleerde fout (geen ongecontroleerde retry);
 * - niet-gekoppelde provider (UnavailableCalendarProvider) → available:false +
 *   reason (bestaand gedrag — de tool verzint NOOIT slots);
 * - bounding: slots max 50 (afkappen, reason "slots truncated");
 * - audit: windowHash + slotsCount + provider — nooit agenda-inhoud of klantdata.
 */

import { createHash } from "node:crypto";

import type { AvailabilitySlot, CalendarProvider } from "../../booking/types.ts";

const WINDOW_MAX_DAYS = 14;
const SLOTS_MAX = 50;
const TIMEZONE_MAX = 64;
const DURATION_MIN = 15;
const DURATION_MAX = 240;

export interface CalendarReadDeps {
  /** Injectable provider (test-double in tests; productie: bestaande factory). */
  provider: CalendarProvider;
  tenantId: string;
  log?: (message: string) => void;
}

export interface CalendarReadAudit {
  windowHash: string;
  slotsCount: number;
  provider: string;
}

export interface CalendarReadToolResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  audit?: CalendarReadAudit;
}

export interface CalendarReadOutput {
  available: boolean;
  slots: AvailabilitySlot[];
  provider: string;
  reason: string | null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** ISO-datum (YYYY-MM-DD) met round-trip: 2026-02-31 rolt niet door naar maart. */
function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

/** IANA-timezone-validatie via Intl: ongeldige naam gooit RangeError. */
export function isValidTimezone(value: string): boolean {
  if (value.length === 0 || value.length > TIMEZONE_MAX) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

interface CalendarReadInput {
  startDate: string;
  endDate: string;
  timezone: string;
  durationMinutes: number;
}

function validateCalendarRead(input: unknown): CalendarReadInput | { error: string } {
  if (!isRecord(input)) return { error: "INVALID_CALENDAR_INPUT" };
  const allowed = new Set(["startDate", "endDate", "timezone", "durationMinutes"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) return { error: "INVALID_CALENDAR_INPUT" };
  }
  for (const key of ["startDate", "endDate", "timezone"]) {
    if (typeof input[key] !== "string" || input[key].trim().length === 0) {
      return { error: "INVALID_CALENDAR_INPUT" };
    }
  }
  const { startDate, endDate, timezone, durationMinutes } = input as Record<string, unknown>;

  const start = parseISODate((startDate as string).trim());
  const end = parseISODate((endDate as string).trim());
  if (!start || !end) return { error: "INVALID_CALENDAR_INPUT" };
  if (!isValidTimezone((timezone as string).trim())) return { error: "INVALID_CALENDAR_INPUT" };

  if (
    typeof durationMinutes !== "number" ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < DURATION_MIN ||
    durationMinutes > DURATION_MAX
  ) {
    return { error: "INVALID_CALENDAR_INPUT" };
  }

  const windowDays = (end.getTime() - start.getTime()) / 86_400_000;
  if (windowDays < 0 || windowDays > WINDOW_MAX_DAYS) {
    return { error: "INVALID_WINDOW" };
  }

  return {
    startDate: (startDate as string).trim(),
    endDate: (endDate as string).trim(),
    timezone: (timezone as string).trim(),
    durationMinutes,
  };
}

export async function executeCalendarRead(
  input: unknown,
  deps: CalendarReadDeps,
): Promise<CalendarReadToolResult<CalendarReadOutput>> {
  if (!deps.tenantId || deps.tenantId.trim().length === 0) {
    return { ok: false, error: "TENANT_REQUIRED" };
  }
  const validated = validateCalendarRead(input);
  if ("error" in validated) {
    return { ok: false, error: validated.error };
  }

  let result;
  try {
    result = await deps.provider.getAvailability({
      startDate: validated.startDate,
      endDate: validated.endDate,
      timezone: validated.timezone,
      durationMinutes: validated.durationMinutes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log?.(`[calendar:${deps.tenantId}] availability failed: ${message.slice(0, 200)}`);
    return { ok: false, error: "CALENDAR_CLIENT_ERROR" };
  }

  // Bounding: nooit een onbeperkte lijst; afkappen is expliciet zichtbaar.
  const truncated = result.slots.length > SLOTS_MAX;
  const slots = result.slots.slice(0, SLOTS_MAX);
  const reason = truncated
    ? "slots truncated"
    : (result.reason ?? null);

  const windowHash = sha256(
    `${validated.startDate}|${validated.endDate}|${validated.timezone}|${validated.durationMinutes}`,
  );
  return {
    ok: true,
    value: { available: result.available, slots, provider: result.provider, reason },
    audit: { windowHash, slotsCount: slots.length, provider: result.provider },
  };
}
