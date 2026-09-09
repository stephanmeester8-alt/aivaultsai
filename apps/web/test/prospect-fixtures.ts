/**
 * Gedeelde fixtures voor prospect-pipeline tests. Geen echte DB, geen
 * echte e-mail, geen externe providers.
 */

import type { Prospect, ProspectOutreach } from "../lib/prospect-pipeline/types.ts";
import type { ProspectSql } from "../lib/prospect-pipeline/repository.ts";

export const TENANT = "11111111-1111-4111-8111-111111111111";

/** Prospect-fixture met verplichte velden. */
export function makeProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    prospectId: "p-1",
    tenantId: TENANT,
    companyName: "Voorbeeld Installaties BV",
    industry: "Installatietechniek",
    city: "Utrecht",
    website: "https://voorbeeld-installaties.nl",
    email: "info@voorbeeld-installaties.nl",
    emailNormalized: "info@voorbeeld-installaties.nl",
    domainNormalized: "voorbeeld-installaties.nl",
    phone: "+31 30 123 4567",
    leadScore: 70,
    priority: "MEDIUM",
    personalizationAngle: "Zij installeren warmtepompen en hebben nog geen chatbot.",
    sourceUrl: "https://www.google.com/search?q=voorbeeld+installaties",
    status: "WAITING_FOR_REPLY",
    contactAttempts: 1,
    firstEmailSentAt: "2026-01-05T09:00:00.000Z",
    gmailMessageId: "msg-first-1",
    lastContactAt: null,
    nextActionAt: null,
    replyStatus: null,
    doNotContact: false,
    notes: null,
    createdAt: "2026-01-05T09:00:00.000Z",
    updatedAt: "2026-01-05T09:00:00.000Z",
    ...overrides,
  };
}

export function makeFollowUp(overrides: Partial<ProspectOutreach> = {}): ProspectOutreach {
  return {
    outreachId: "o-follow-1",
    tenantId: TENANT,
    prospectId: "p-1",
    kind: "FOLLOW_UP",
    status: "APPROVED",
    toAddress: "info@voorbeeld-installaties.nl",
    fromAddress: "stephan@aivaultsai.one",
    subject: "Re: AI-assistent voor jullie website",
    body: "Goedendag,\n\nIk wilde even controleren…",
    gmailMessageId: null,
    gmailThreadId: null,
    sentAt: null,
    createdAt: "2026-01-08T09:00:00.000Z",
    updatedAt: "2026-01-08T09:00:00.000Z",
    ...overrides,
  };
}

/** Eenvoudige in-memory sql dubbel die elke query als opgeroepen registreert. */
export function memorySql(overrides: {
  insertProspectRows?: Array<Record<string, unknown>>;
} = {}): { sql: ProspectSql; calls: Array<{ text: string; values: unknown[] }> } {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql: ProspectSql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (/INSERT INTO prospects[\s\S]*RETURNING prospect_id/.test(text)) {
      const rows = overrides.insertProspectRows ?? [{ prospect_id: `prospect-${calls.length}` }];
      return rows;
    }
    if (/INSERT INTO prospect_outreach[\s\S]*RETURNING outreach_id/.test(text)) {
      return [{ outreach_id: `outreach-${calls.length}` }];
    }
    if (/INSERT INTO prospect_replies[\s\S]*RETURNING reply_id/.test(text)) {
      return [{ reply_id: `reply-${calls.length}` }];
    }
    if (/UPDATE prospects/.test(text)) {
      return [{ prospect_id: values[values.length - 1] ?? "p-1" }];
    }
    if (/UPDATE prospect_outreach/.test(text)) {
      return [{ outreach_id: values[values.length - 1] ?? "o-1" }];
    }
    return [];
  };
  return { sql, calls };
}

/** ISO-datum helper voor werkdag-tests (UTC). */
export function atUtc(isoDate: string, hour = 9): Date {
  return new Date(`${isoDate}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}
