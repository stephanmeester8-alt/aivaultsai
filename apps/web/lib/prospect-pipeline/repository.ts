/**
 * Prospect Acquisition Pipeline — repository (injectable sql, zelfde patroon
 * als de overige repositories: tests zonder echte DB, productie via de
 * gedeelde db-client). NO TENANT = NO EXECUTION: elke query draagt tenant_id.
 *
 * Kolomlijsten zijn bewust letterlijk in elke query opgenomen (geen
 * dynamische sql-fragmenten): consistent met de rest van de codebase en
 * volledig testbaar met de tagged-template sql-dubbel.
 */

import type {
  Prospect,
  ProspectOutreach,
  ProspectOutreachKind,
  ProspectOutreachStatus,
  ProspectReply,
  ProspectReplyClass,
  ProspectStatus,
} from "./types.ts";

export type ProspectSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

/** Veilige cast van een query-rij naar een record voor row-mappers. */
function toRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/* ------------------------------------------------------------------ */
/* prospects                                                           */
/* ------------------------------------------------------------------ */

export interface CreateProspectInput {
  tenantId: string;
  companyName: string;
  emailNormalized: string | null;
  domainNormalized: string | null;
  industry?: string | null;
  city?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  leadScore?: number | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | null;
  personalizationAngle?: string | null;
  sourceUrl?: string | null;
  status: ProspectStatus;
  contactAttempts?: number;
  firstEmailSentAt?: string | null;
  gmailMessageId?: string | null;
  notes?: string | null;
}

/**
 * Maak één prospect. De database-unique constraints op
 * (tenant_id, email_normalized) en (tenant_id, domain_normalized) zijn de
 * harde grens tegen dubbele prospects; een violatie gooit een fout.
 */
export async function createProspect(
  sql: ProspectSql,
  input: CreateProspectInput,
): Promise<string> {
  const rows = (await sql`
    INSERT INTO prospects (
      tenant_id,
      company_name,
      email_normalized,
      domain_normalized,
      industry,
      city,
      website,
      email,
      phone,
      lead_score,
      priority,
      personalization_angle,
      source_url,
      status,
      contact_attempts,
      first_email_sent_at,
      gmail_message_id,
      notes
    )
    VALUES (
      ${input.tenantId}::uuid,
      ${input.companyName},
      ${input.emailNormalized ?? null},
      ${input.domainNormalized ?? null},
      ${input.industry ?? null},
      ${input.city ?? null},
      ${input.website ?? null},
      ${input.email ?? null},
      ${input.phone ?? null},
      ${input.leadScore ?? null},
      ${input.priority ?? null},
      ${input.personalizationAngle ?? null},
      ${input.sourceUrl ?? null},
      ${input.status},
      ${input.contactAttempts ?? 0},
      ${input.firstEmailSentAt ?? null},
      ${input.gmailMessageId ?? null},
      ${input.notes ?? null}
    )
    RETURNING prospect_id
  `) as { prospect_id?: unknown }[];
  const id = rows[0]?.prospect_id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Prospect creation returned no id.");
  }
  return id;
}

export async function getProspect(
  sql: ProspectSql,
  tenantId: string,
  prospectId: string,
): Promise<Prospect | null> {
  const rows = (await sql`
    SELECT
      prospect_id, tenant_id, company_name, industry, city, website, email,
      email_normalized, domain_normalized, phone, lead_score, priority,
      personalization_angle, source_url, status, contact_attempts,
      first_email_sent_at, gmail_message_id, last_contact_at, next_action_at,
      reply_status, do_not_contact, notes, created_at, updated_at
    FROM prospects
    WHERE tenant_id = ${tenantId}::uuid
      AND prospect_id = ${prospectId}::uuid
    LIMIT 1
  `) as unknown[];
  return rows[0] ? (mapProspectRow(toRecord(rows[0])) as Prospect) : null;
}

export async function findProspectByEmail(
  sql: ProspectSql,
  tenantId: string,
  emailNormalized: string,
): Promise<Prospect | null> {
  const rows = (await sql`
    SELECT
      prospect_id, tenant_id, company_name, industry, city, website, email,
      email_normalized, domain_normalized, phone, lead_score, priority,
      personalization_angle, source_url, status, contact_attempts,
      first_email_sent_at, gmail_message_id, last_contact_at, next_action_at,
      reply_status, do_not_contact, notes, created_at, updated_at
    FROM prospects
    WHERE tenant_id = ${tenantId}::uuid
      AND email_normalized = ${emailNormalized}
    LIMIT 1
  `) as unknown[];
  return rows[0] ? (mapProspectRow(toRecord(rows[0])) as Prospect) : null;
}

export async function findProspectByDomain(
  sql: ProspectSql,
  tenantId: string,
  domainNormalized: string,
): Promise<Prospect | null> {
  const rows = (await sql`
    SELECT
      prospect_id, tenant_id, company_name, industry, city, website, email,
      email_normalized, domain_normalized, phone, lead_score, priority,
      personalization_angle, source_url, status, contact_attempts,
      first_email_sent_at, gmail_message_id, last_contact_at, next_action_at,
      reply_status, do_not_contact, notes, created_at, updated_at
    FROM prospects
    WHERE tenant_id = ${tenantId}::uuid
      AND domain_normalized = ${domainNormalized}
    LIMIT 1
  `) as unknown[];
  return rows[0] ? (mapProspectRow(toRecord(rows[0])) as Prospect) : null;
}

/** Status-update (bijv. WAITING_FOR_REPLY, FOLLOW_UP_DUE, BOUNCED, LOST). */
export async function updateProspectStatus(
  sql: ProspectSql,
  tenantId: string,
  prospectId: string,
  status: ProspectStatus,
): Promise<boolean> {
  const rows = (await sql`
    UPDATE prospects
    SET status = ${status}, updated_at = NOW()
    WHERE tenant_id = ${tenantId}::uuid
      AND prospect_id = ${prospectId}::uuid
    RETURNING prospect_id
  `) as { prospect_id?: unknown }[];
  return rows.length === 1;
}

/** Registreer een handmatig geregistreerde reactie op de prospect. */
export async function applyReplyToProspect(
  sql: ProspectSql,
  tenantId: string,
  prospectId: string,
  patch: {
    status: ProspectStatus;
    replyStatus: ProspectReplyClass;
    lastContactAt: string;
    nextActionAt?: string | null;
    notes?: string | null;
  },
): Promise<boolean> {
  const rows = (await sql`
    UPDATE prospects
    SET status = ${patch.status},
        reply_status = ${patch.replyStatus},
        last_contact_at = ${patch.lastContactAt},
        next_action_at = ${patch.nextActionAt ?? null},
        notes = ${patch.notes ?? null},
        updated_at = NOW()
    WHERE tenant_id = ${tenantId}::uuid
      AND prospect_id = ${prospectId}::uuid
    RETURNING prospect_id
  `) as { prospect_id?: unknown }[];
  return rows.length === 1;
}

/** Zet do-not-contact en eindstatus (DO_NOT_CONTACT of LOST). */
export async function setDoNotContact(
  sql: ProspectSql,
  tenantId: string,
  prospectId: string,
  status: Extract<ProspectStatus, "DO_NOT_CONTACT" | "LOST">,
): Promise<boolean> {
  const rows = (await sql`
    UPDATE prospects
    SET do_not_contact = TRUE,
        status = ${status},
        updated_at = NOW()
    WHERE tenant_id = ${tenantId}::uuid
      AND prospect_id = ${prospectId}::uuid
    RETURNING prospect_id
  `) as { prospect_id?: unknown }[];
  return rows.length === 1;
}

export async function listProspectsByStatus(
  sql: ProspectSql,
  tenantId: string,
  statuses: ProspectStatus[],
  limit = 50,
): Promise<Prospect[]> {
  if (statuses.length === 0) return [];
  const rows = (await sql`
    SELECT
      prospect_id, tenant_id, company_name, industry, city, website, email,
      email_normalized, domain_normalized, phone, lead_score, priority,
      personalization_angle, source_url, status, contact_attempts,
      first_email_sent_at, gmail_message_id, last_contact_at, next_action_at,
      reply_status, do_not_contact, notes, created_at, updated_at
    FROM prospects
    WHERE tenant_id = ${tenantId}::uuid
      AND status = ANY(${statuses})
    ORDER BY next_action_at ASC NULLS LAST, created_at ASC
    LIMIT ${limit}
  `) as unknown[];
  return rows.map((r) => mapProspectRow(toRecord(r)) as Prospect);
}

export async function countProspectsByStatus(
  sql: ProspectSql,
  tenantId: string,
  statuses: ProspectStatus[],
): Promise<{ status: ProspectStatus; count: number }[]> {
  if (statuses.length === 0) return [];
  const rows = (await sql`
    SELECT status, COUNT(*) AS count
    FROM prospects
    WHERE tenant_id = ${tenantId}::uuid
      AND status = ANY(${statuses})
    GROUP BY status
  `) as unknown[];
  const byStatus = new Map<string, number>();
  for (const row of rows as { status?: unknown; count?: unknown }[]) {
    if (row.status && row.count !== undefined) {
      byStatus.set(String(row.status), Number(row.count));
    }
  }
  return statuses.map((status) => ({ status, count: byStatus.get(status) ?? 0 }));
}

/* ------------------------------------------------------------------ */
/* prospect_outreach                                                   */
/* ------------------------------------------------------------------ */

export interface CreateOutreachInput {
  tenantId: string;
  prospectId: string;
  kind: ProspectOutreachKind;
  status: ProspectOutreachStatus;
  toAddress: string;
  fromAddress: string;
  subject: string;
  body: string;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  sentAt?: string | null;
}

/**
 * Maak één outreach-record. De DB-unique (prospect_id, kind) blokkeert:
 *  - een tweede FIRST_EMAIL per prospect;
 *  - een tweede FOLLOW_UP per prospect.
 */
export async function createOutreach(
  sql: ProspectSql,
  input: CreateOutreachInput,
): Promise<string> {
  const rows = (await sql`
    INSERT INTO prospect_outreach (
      tenant_id,
      prospect_id,
      kind,
      status,
      to_address,
      from_address,
      subject,
      body,
      gmail_message_id,
      gmail_thread_id,
      sent_at
    )
    VALUES (
      ${input.tenantId}::uuid,
      ${input.prospectId}::uuid,
      ${input.kind},
      ${input.status},
      ${input.toAddress},
      ${input.fromAddress},
      ${input.subject},
      ${input.body},
      ${input.gmailMessageId ?? null},
      ${input.gmailThreadId ?? null},
      ${input.sentAt ?? null}
    )
    RETURNING outreach_id
  `) as { outreach_id?: unknown }[];
  const id = rows[0]?.outreach_id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Outreach creation returned no id.");
  }
  return id;
}

export async function getOutreach(
  sql: ProspectSql,
  tenantId: string,
  prospectId: string,
  kind: ProspectOutreachKind,
): Promise<ProspectOutreach | null> {
  const rows = (await sql`
    SELECT
      outreach_id, tenant_id, prospect_id, kind, status, to_address,
      from_address, subject, body, gmail_message_id, gmail_thread_id,
      sent_at, created_at, updated_at
    FROM prospect_outreach
    WHERE tenant_id = ${tenantId}::uuid
      AND prospect_id = ${prospectId}::uuid
      AND kind = ${kind}
    LIMIT 1
  `) as unknown[];
  return rows[0] ? (mapOutreachRow(toRecord(rows[0])) as ProspectOutreach) : null;
}

export async function updateOutreachStatus(
  sql: ProspectSql,
  tenantId: string,
  outreachId: string,
  status: ProspectOutreachStatus,
): Promise<boolean> {
  const rows = (await sql`
    UPDATE prospect_outreach
    SET status = ${status}, updated_at = NOW()
    WHERE tenant_id = ${tenantId}::uuid
      AND outreach_id = ${outreachId}::uuid
    RETURNING outreach_id
  `) as { outreach_id?: unknown }[];
  return rows.length === 1;
}

/* ------------------------------------------------------------------ */
/* prospect_replies                                                    */
/* ------------------------------------------------------------------ */

export interface CreateReplyInput {
  tenantId: string;
  prospectId: string;
  outreachId?: string | null;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  classification: ProspectReplyClass;
  summary?: string | null;
  nextAction?: string | null;
  receivedAt?: string;
}

export async function createReply(
  sql: ProspectSql,
  input: CreateReplyInput,
): Promise<string> {
  const rows = (await sql`
    INSERT INTO prospect_replies (
      tenant_id,
      prospect_id,
      outreach_id,
      gmail_message_id,
      gmail_thread_id,
      classification,
      summary,
      next_action,
      received_at
    )
    VALUES (
      ${input.tenantId}::uuid,
      ${input.prospectId}::uuid,
      ${input.outreachId ?? null}::uuid,
      ${input.gmailMessageId ?? null},
      ${input.gmailThreadId ?? null},
      ${input.classification},
      ${input.summary ?? null},
      ${input.nextAction ?? null},
      ${input.receivedAt ?? null}
    )
    RETURNING reply_id
  `) as { reply_id?: unknown }[];
  const id = rows[0]?.reply_id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Reply creation returned no id.");
  }
  return id;
}

/** Zoek replies op gmail message-id OF thread-id (tenant-scoped). */
export async function findRepliesByThread(
  sql: ProspectSql,
  tenantId: string,
  messageId: string | null,
  threadId: string | null,
): Promise<ProspectReply[]> {
  if (!messageId && !threadId) return [];
  const messageParam = messageId ?? null;
  const threadParam = threadId ?? null;
  const rows = (await sql`
    SELECT
      reply_id, tenant_id, prospect_id, outreach_id, gmail_message_id,
      gmail_thread_id, classification, summary, next_action, received_at, created_at
    FROM prospect_replies
    WHERE tenant_id = ${tenantId}::uuid
      AND (
        (${messageParam} IS NOT NULL AND gmail_message_id = ${messageParam})
        OR
        (${threadParam} IS NOT NULL AND gmail_thread_id = ${threadParam})
      )
    ORDER BY received_at DESC
  `) as unknown[];
  return rows.map((r) => mapReplyRow(toRecord(r)) as ProspectReply);
}

/* ------------------------------------------------------------------ */
/* row-mappers                                                         */
/* ------------------------------------------------------------------ */

export function mapProspectRow(row: Record<string, unknown>): Prospect {
  return {
    prospectId: String(row.prospect_id),
    tenantId: String(row.tenant_id),
    companyName: String(row.company_name ?? ""),
    industry: row.industry == null ? null : String(row.industry),
    city: row.city == null ? null : String(row.city),
    website: row.website == null ? null : String(row.website),
    email: row.email == null ? null : String(row.email),
    emailNormalized: row.email_normalized == null ? null : String(row.email_normalized),
    domainNormalized: row.domain_normalized == null ? null : String(row.domain_normalized),
    phone: row.phone == null ? null : String(row.phone),
    leadScore: row.lead_score == null ? null : Number(row.lead_score),
    priority: row.priority == null ? null : (row.priority as Prospect["priority"]),
    personalizationAngle:
      row.personalization_angle == null ? null : String(row.personalization_angle),
    sourceUrl: row.source_url == null ? null : String(row.source_url),
    status: row.status as ProspectStatus,
    contactAttempts: Number(row.contact_attempts ?? 0),
    firstEmailSentAt: row.first_email_sent_at == null ? null : String(row.first_email_sent_at),
    gmailMessageId: row.gmail_message_id == null ? null : String(row.gmail_message_id),
    lastContactAt: row.last_contact_at == null ? null : String(row.last_contact_at),
    nextActionAt: row.next_action_at == null ? null : String(row.next_action_at),
    replyStatus: row.reply_status == null ? null : (row.reply_status as ProspectReplyClass),
    doNotContact: Boolean(row.do_not_contact),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapOutreachRow(row: Record<string, unknown>): ProspectOutreach {
  return {
    outreachId: String(row.outreach_id),
    tenantId: String(row.tenant_id),
    prospectId: String(row.prospect_id),
    kind: row.kind as ProspectOutreach["kind"],
    status: row.status as ProspectOutreach["status"],
    toAddress: String(row.to_address ?? ""),
    fromAddress: String(row.from_address ?? ""),
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    gmailMessageId: row.gmail_message_id == null ? null : String(row.gmail_message_id),
    gmailThreadId: row.gmail_thread_id == null ? null : String(row.gmail_thread_id),
    sentAt: row.sent_at == null ? null : String(row.sent_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapReplyRow(row: Record<string, unknown>): ProspectReply {
  return {
    replyId: String(row.reply_id),
    tenantId: String(row.tenant_id),
    prospectId: String(row.prospect_id),
    outreachId: row.outreach_id == null ? null : String(row.outreach_id),
    gmailMessageId: row.gmail_message_id == null ? null : String(row.gmail_message_id),
    gmailThreadId: row.gmail_thread_id == null ? null : String(row.gmail_thread_id),
    classification: row.classification as ProspectReplyClass,
    summary: row.summary == null ? null : String(row.summary),
    nextAction: row.next_action == null ? null : String(row.next_action),
    receivedAt: String(row.received_at ?? row.created_at),
    createdAt: String(row.created_at),
  };
}
