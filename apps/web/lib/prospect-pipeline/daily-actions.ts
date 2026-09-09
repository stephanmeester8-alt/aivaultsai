/**
 * Prospect Acquisition Pipeline — dagelijkse actielijst (Fase 6).
 *
 * Toont per dag wat aandacht nodig heeft. Richtlijnen zijn géén automatische
 * verzendquota — alleen een overzicht voor de eigenaar. Lees-only.
 */

import type { Prospect, ProspectStatus } from "./types.ts";
import type { ProspectSql } from "./repository.ts";
import { listProspectsByStatus } from "./repository.ts";

export interface DailyActions {
  /** Datum (YYYY-MM-DD, UTC) waarop de lijst is opgesteld. */
  date: string;
  newProspects: Prospect[]; // NEW / RESEARCHED / READY_FOR_OUTREACH
  repliesToday: Prospect[]; // REPLIED — vandaag aandacht nodig
  followUpsDue: Prospect[]; // FOLLOW_UP_DUE / FOLLOW_UP_DRAFTED (klaar om te verwerken)
  callDue: Prospect[]; // CALL_DUE
  demoScheduled: Prospect[]; // DEMO_SCHEDULED / DEMO_OFFERED
  bounced: Prospect[]; // BOUNCED
  doNotContact: Prospect[]; // DO_NOT_CONTACT
  counts: Record<string, number>;
}

/** Dagelijkse richtlijn (statisch; geen automatische verzending). */
export const DAILY_GUIDELINE = {
  researchNewProspects: 10,
  prepareFirstEmails: 5,
  followUpEarlierProspects: 5,
  callProspects: "2 tot 3",
  processRepliesAndStatuses: "alle reacties en statussen",
} as const;

const MAX_PER_BUCKET = 25;

export async function buildDailyActions(
  sql: ProspectSql,
  tenantId: string,
  now: Date = new Date(),
): Promise<DailyActions> {
  const date = now.toISOString().slice(0, 10);

  const [newProspects, repliesToday, followUpsDue, callDue, demo, bounced, dnc] =
    await Promise.all([
      listProspectsByStatus(
        sql,
        tenantId,
        ["NEW", "RESEARCHED", "READY_FOR_OUTREACH"],
        MAX_PER_BUCKET,
      ),
      listProspectsByStatus(sql, tenantId, ["REPLIED"], MAX_PER_BUCKET),
      listProspectsByStatus(
        sql,
        tenantId,
        ["FOLLOW_UP_DUE", "FOLLOW_UP_DRAFTED"],
        MAX_PER_BUCKET,
      ),
      listProspectsByStatus(sql, tenantId, ["CALL_DUE"], MAX_PER_BUCKET),
      listProspectsByStatus(sql, tenantId, ["DEMO_OFFERED", "DEMO_SCHEDULED"], MAX_PER_BUCKET),
      listProspectsByStatus(sql, tenantId, ["BOUNCED"], MAX_PER_BUCKET),
      listProspectsByStatus(sql, tenantId, ["DO_NOT_CONTACT"], MAX_PER_BUCKET),
    ]);

  const counts: Record<string, number> = {
    new: newProspects.length,
    replies: repliesToday.length,
    followUps: followUpsDue.length,
    call: callDue.length,
    demo: demo.length,
    bounced: bounced.length,
    doNotContact: dnc.length,
  };

  return {
    date,
    newProspects,
    repliesToday,
    followUpsDue,
    callDue,
    demoScheduled: demo,
    bounced,
    doNotContact: dnc,
    counts,
  };
}

/** Filterhelper: welke statussen horen bij "wacht op opvolging". */
export const FOLLOW_UP_WAITING_STATUSES: readonly ProspectStatus[] = [
  "WAITING_FOR_REPLY",
  "FOLLOW_UP_DUE",
  "FOLLOW_UP_DRAFTED",
];
