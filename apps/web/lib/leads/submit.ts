/**
 * Lead-formulier — submit-flow (server-side, fail-closed).
 *
 * Volgorde:
 *   1. validatie (honeypot wordt STIL genegeerd — geen signaal aan bots);
 *   2. database-insert is de primaire operatie: mislukt die, dan is de
 *      response GEEN succes;
 *   3. e-mailnotificatie is secundair: fout wordt gelogd, de lead blijft
 *      staan en de bezoeker krijgt wél succes (observable in logs).
 *
 * Alles is injectable (sql/notifier/now) zodat tests zonder echte
 * DB/e-mail draaien.
 */

import { insertContactLead, type LeadsSql } from "./repository.ts";
import type { LeadNotifier } from "./notify.ts";
import type { LeadSubmission } from "./validation.ts";

export type SubmitLeadResult =
  | { ok: true; discarded: boolean; leadId?: string }
  | { ok: false; error: "INVALID_INPUT" | "STORAGE_FAILED" };

export interface SubmitLeadDeps {
  sql: LeadsSql;
  notifier: LeadNotifier | null;
  now?: () => string;
  log?: (message: string) => void;
}

export async function submitLead(
  deps: SubmitLeadDeps,
  submission: LeadSubmission,
): Promise<SubmitLeadResult> {
  const log = deps.log ?? ((message: string) => console.info(`[leads] ${message}`));

  // Honeypot gevuld → stil negeren (geen insert, geen notificatie).
  if (submission.website.length > 0) {
    log("honeypot hit — submission silently discarded");
    return { ok: true, discarded: true };
  }

  // 1. Database-insert is primair.
  let inserted;
  try {
    inserted = await insertContactLead(deps.sql, {
      name: submission.name,
      email: submission.email,
      phone: submission.phone,
      company: submission.company,
      service: submission.service,
      message: submission.message,
      status: "new",
      source: "website",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`contact lead insert failed: ${message.slice(0, 200)}`);
    return { ok: false, error: "STORAGE_FAILED" };
  }

  // 2. Notificatie secundair: fout loggen, lead behouden, succes retourneren.
  if (deps.notifier) {
    try {
      await deps.notifier({
        leadId: inserted.leadId,
        name: submission.name,
        email: submission.email,
        phone: submission.phone,
        company: submission.company,
        service: submission.service,
        message: submission.message,
        source: "website",
        submittedAt: deps.now?.() ?? new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`lead notification failed (lead ${inserted.leadId} kept): ${message.slice(0, 200)}`);
    }
  } else {
    log(`no notifier configured — lead ${inserted.leadId} stored without notification`);
  }

  return { ok: true, discarded: false, leadId: inserted.leadId };
}
