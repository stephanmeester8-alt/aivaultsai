/**
 * Prospect Acquisition Pipeline — handmatige reactie-registratie (v1, Fase 4).
 *
 * Geen Gmail-API in v1. Een reactie wordt handmatig geregistreerd:
 *  - prospect selecteren;
 *  - message-ID of thread-ID invullen;
 *  - reactiestatus/classificatie registreren;
 *  - korte samenvatting vastleggen (geen volledige inhoud);
 *  - volgende actie bepalen.
 *
 * Regels:
 *  - een reactie zet de prospect op REPLIED (of DO_NOT_CONTACT/LOST);
 *  - een reactie blokkeert automatische opvolging (canPrepareFollowUp -> false);
 *  - automatische beantwoording en automatische verzending bestaan niet;
 *  - bij INTERESTED wordt een persoonlijk antwoordconcept klaargezet (demo
 *    15 minuten); verzending vereist altijd goedkeuring.
 */

import type {
  Prospect,
  ProspectOutreach,
  ProspectReplyClass,
  ProspectStatus,
} from "./types.ts";
import { statusAfterReply } from "./follow-up.ts";
import type { ProspectSql } from "./repository.ts";
import {
  applyReplyToProspect,
  createReply,
  createOutreach,
  getOutreach,
  setDoNotContact,
} from "./repository.ts";
import { buildInterestedReplyDraft } from "./outreach-draft.ts";

export const VALID_REPLY_CLASSES: readonly ProspectReplyClass[] = [
  "INTERESTED",
  "QUESTION",
  "NOT_NOW",
  "NOT_INTERESTED",
  "UNSUBSCRIBE",
  "UNKNOWN",
];

export function isValidReplyClass(value: unknown): value is ProspectReplyClass {
  return typeof value === "string" && (VALID_REPLY_CLASSES as readonly string[]).includes(value);
}

export interface RegisterReplyInput {
  tenantId: string;
  prospectId: string;
  classification: ProspectReplyClass;
  summary?: string;
  nextAction?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  receivedAt?: string;
  /** Verwachte afzender voor het INTERESTED-antwoordconcept (serverconfig). */
  expectedFromAddress: string;
}

export interface RegisterReplyResult {
  prospectId: string;
  status: ProspectStatus;
  replyId: string;
  /** Alleen bij INTERESTED: id van het klaargezette concept (DRAFT). */
  interestedDraftOutreachId?: string;
}

/**
 * Registreer één handmatige reactie en werk de prospect bij.
 * Nooit automatische verzending; concepten blijven DRAFT.
 */
export async function registerManualReply(
  sql: ProspectSql,
  prospect: Prospect,
  input: RegisterReplyInput,
): Promise<RegisterReplyResult> {
  const replyId = await createReply(sql, {
    tenantId: input.tenantId,
    prospectId: input.prospectId,
    gmailMessageId: input.gmailMessageId || null,
    gmailThreadId: input.gmailThreadId || null,
    classification: input.classification,
    summary: input.summary || null,
    nextAction: input.nextAction || null,
    receivedAt: input.receivedAt,
  });

  const lastContactAt = input.receivedAt ?? new Date().toISOString();

  if (input.classification === "UNSUBSCRIBE") {
    await setDoNotContact(sql, input.tenantId, input.prospectId, "DO_NOT_CONTACT");
    return { prospectId: input.prospectId, status: "DO_NOT_CONTACT", replyId };
  }
  if (input.classification === "NOT_INTERESTED") {
    await setDoNotContact(sql, input.tenantId, input.prospectId, "LOST");
    return { prospectId: input.prospectId, status: "LOST", replyId };
  }

  const status = statusAfterReply(input.classification); // REPLIED
  await applyReplyToProspect(sql, input.tenantId, input.prospectId, {
    status,
    replyStatus: input.classification,
    lastContactAt,
    nextActionAt: input.nextAction ? undefined : null,
    notes: input.summary || null,
  });

  // INTERESTED: persoonlijk antwoordconcept (demo 15 min) klaarzetten als
  // DRAFT. Verzending vereist een afzonderlijke approval (canSendFollowUp).
  let interestedDraftOutreachId: string | undefined;
  if (input.classification === "INTERESTED") {
    const existing = await getOutreach(sql, input.tenantId, input.prospectId, "FIRST_EMAIL");
    const draft = buildInterestedReplyDraft(prospect);
    interestedDraftOutreachId = await createOutreach(sql, {
      tenantId: input.tenantId,
      prospectId: input.prospectId,
      kind: "FIRST_EMAIL", // antwoord op de eerste e-mail, geen nieuwe follow-up
      status: "DRAFT",
      toAddress: prospect.email ?? "",
      fromAddress: input.expectedFromAddress,
      subject: draft.subject,
      body: draft.body,
      gmailThreadId: input.gmailThreadId || existing?.gmailThreadId || null,
    });
  }

  return {
    prospectId: input.prospectId,
    status,
    replyId,
    interestedDraftOutreachId,
  };
}

/** Helper voor logging: welke outreach hoort bij deze thread (indien aanwezig). */
export async function findOutreachByThread(
  sql: ProspectSql,
  tenantId: string,
  messageId: string | null,
  threadId: string | null,
): Promise<ProspectOutreach | null> {
  if (!messageId && !threadId) return null;
  const byMessage = messageId
    ? await findOutreachByMessageId(sql, tenantId, messageId)
    : null;
  if (byMessage) return byMessage;
  if (threadId) return findOutreachByMessageId(sql, tenantId, threadId);
  return null;
}

async function findOutreachByMessageId(
  sql: ProspectSql,
  tenantId: string,
  id: string,
): Promise<ProspectOutreach | null> {
  const rows = (await sql`
    SELECT outreach_id, tenant_id, prospect_id, kind, status, to_address,
           from_address, subject, body, gmail_message_id, gmail_thread_id,
           sent_at, created_at, updated_at
    FROM prospect_outreach
    WHERE tenant_id = ${tenantId}::uuid
      AND (gmail_message_id = ${id} OR gmail_thread_id = ${id})
    LIMIT 1
  `) as unknown[];
  if (!rows[0]) return null;
  const r = rows[0] as Record<string, unknown>;
  return {
    outreachId: String(r.outreach_id),
    tenantId: String(r.tenant_id),
    prospectId: String(r.prospect_id),
    kind: r.kind as ProspectOutreach["kind"],
    status: r.status as ProspectOutreach["status"],
    toAddress: String(r.to_address ?? ""),
    fromAddress: String(r.from_address ?? ""),
    subject: String(r.subject ?? ""),
    body: String(r.body ?? ""),
    gmailMessageId: r.gmail_message_id == null ? null : String(r.gmail_message_id),
    gmailThreadId: r.gmail_thread_id == null ? null : String(r.gmail_thread_id),
    sentAt: r.sent_at == null ? null : String(r.sent_at),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}
