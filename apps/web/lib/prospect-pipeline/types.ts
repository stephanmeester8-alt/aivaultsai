/**
 * Prospect Acquisition Pipeline — gedeelde types (bounded scope).
 *
 * Statussen en classificaties zijn de centrale woordenschat van de
 * acquisitieworkflow. Geen e-mail wordt vanuit deze laag verstuurd; alle
 * verzendacties lopen door de bestaande approval/dispatcher-paden.
 */

export const PROSPECT_STATUSES = [
  "NEW",
  "RESEARCHED",
  "READY_FOR_OUTREACH",
  "FIRST_EMAIL_SENT",
  "WAITING_FOR_REPLY",
  "REPLIED",
  "FOLLOW_UP_DUE",
  "FOLLOW_UP_DRAFTED",
  "CALL_DUE",
  "DEMO_OFFERED",
  "DEMO_SCHEDULED",
  "WON",
  "LOST",
  "DO_NOT_CONTACT",
  "BOUNCED",
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const PROSPECT_REPLY_CLASSES = [
  "INTERESTED",
  "QUESTION",
  "NOT_NOW",
  "NOT_INTERESTED",
  "UNSUBSCRIBE",
  "UNKNOWN",
] as const;

export type ProspectReplyClass = (typeof PROSPECT_REPLY_CLASSES)[number];

export const PROSPECT_OUTREACH_KINDS = ["FIRST_EMAIL", "FOLLOW_UP"] as const;
export type ProspectOutreachKind = (typeof PROSPECT_OUTREACH_KINDS)[number];

export const PROSPECT_OUTREACH_STATUSES = [
  "DRAFT",
  "APPROVED",
  "SENT",
  "BOUNCED",
  "CANCELLED",
] as const;
export type ProspectOutreachStatus = (typeof PROSPECT_OUTREACH_STATUSES)[number];

export type ProspectPriority = "LOW" | "MEDIUM" | "HIGH";

/** Centrale prospect-record (databasevorm; velden = migratie 013). */
export interface Prospect {
  prospectId: string;
  tenantId: string;
  companyName: string;
  industry: string | null;
  city: string | null;
  website: string | null;
  email: string | null;
  emailNormalized: string | null;
  domainNormalized: string | null;
  phone: string | null;
  leadScore: number | null;
  priority: ProspectPriority | null;
  personalizationAngle: string | null;
  sourceUrl: string | null;
  status: ProspectStatus;
  contactAttempts: number;
  firstEmailSentAt: string | null;
  gmailMessageId: string | null;
  lastContactAt: string | null;
  nextActionAt: string | null;
  replyStatus: ProspectReplyClass | null;
  doNotContact: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Verzendadministratie per prospect (max 1 eerste + max 1 follow-up). */
export interface ProspectOutreach {
  outreachId: string;
  tenantId: string;
  prospectId: string;
  kind: ProspectOutreachKind;
  status: ProspectOutreachStatus;
  toAddress: string;
  fromAddress: string;
  subject: string;
  body: string;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Handmatige reactie-registratie (geen volledige e-mailinhoud). */
export interface ProspectReply {
  replyId: string;
  tenantId: string;
  prospectId: string;
  outreachId: string | null;
  gmailMessageId: string | null;
  gmailThreadId: string | null;
  classification: ProspectReplyClass;
  summary: string | null;
  nextAction: string | null;
  receivedAt: string;
  createdAt: string;
}

/** Invoer voor de prospectimport (CSV/XLSX), vóór normalisatie/dedupe. */
export interface ProspectImportRow {
  companyName: string;
  industry?: string;
  city?: string;
  website?: string;
  email?: string;
  phone?: string;
  leadScore?: number | null;
  priority?: ProspectPriority;
  personalizationAngle?: string;
  sourceUrl?: string;
  /** Datum eerste e-mail (ISO of leesbare tekst). */
  firstEmailSentAt?: string;
  gmailMessageId?: string;
  notes?: string;
}

/** Classificatie-uitslag van een importrij (dry-run/executie). */
export type ImportVerdict =
  | { outcome: "NEW" }
  | { outcome: "DUPLICATE_EMAIL"; existingProspectId: string }
  | { outcome: "DUPLICATE_DOMAIN"; existingProspectId: string }
  | { outcome: "MISSING_COMPANY_NAME" }
  | { outcome: "NO_CONTACT_IDENTIFIER" }
  | { outcome: "INVALID_EMAIL" }
  | { outcome: "INVALID_ROW"; reason: string };

export interface ProspectImportReportRow {
  /** Rijnummer in het bronbestand (1 = eerste datarij). */
  rowNumber: number;
  companyName: string;
  emailNormalized: string | null;
  domainNormalized: string | null;
  verdict: ImportVerdict;
}

export interface ProspectImportReport {
  dryRun: boolean;
  totalRows: number;
  newCount: number;
  duplicateCount: number;
  skippedCount: number;
  rows: ProspectImportReportRow[];
}
