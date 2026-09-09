/**
 * Prospect Acquisition Pipeline — veilige import (CSV/XLSX).
 *
 * Veiligheidsregels:
 *  - importeren verstuurt NOOIT e-mail en benadert niemand;
 *  - alle geïmporteerde rijen krijgen status FIRST_EMAIL_SENT (de 28
 *    bestaande prospects zijn al gemaild; er wordt niets opnieuw verzonden);
 *  - duplicaten worden herkend op genormaliseerd e-mailadres EN genormaliseerd
 *    domein (normalize.ts) vóór insert;
 *  - bestaande records worden niet overschreven: bij een duplicate wordt de
 *    rij overgeslagen (dry-run toont dit; executie voert alleen nieuwe rijen
 *    in);
 *  - eerst dry-run tonen, pas daarna (na goedkeuring) uitvoeren.
 */

import * as XLSX from "xlsx";

import type {
  ImportVerdict,
  ProspectImportReport,
  ProspectImportReportRow,
  ProspectImportRow,
} from "./types.ts";
import {
  domainFromWebsite,
  normalizeEmail,
  resolveDomainNormalized,
} from "./normalize.ts";
import type { ProspectSql } from "./repository.ts";
import { createProspect, findProspectByDomain, findProspectByEmail } from "./repository.ts";

export const IMPORT_HEADER_ALIASES: Readonly<Record<string, keyof ProspectImportRow>> = {
  company: "companyName",
  companyname: "companyName",
  bedrijf: "companyName",
  bedrijfsnaam: "companyName",
  naam: "companyName",
  sector: "industry",
  industrie: "industry",
  industry: "industry",
  plaats: "city",
  city: "city",
  locatie: "city",
  website: "website",
  email: "email",
  "e-mail": "email",
  mailadres: "email",
  emailadres: "email",
  telefoon: "phone",
  phone: "phone",
  telefoonnummer: "phone",
  score: "leadScore",
  leadscore: "leadScore",
  prioriteit: "priority",
  priority: "priority",
  hoek: "personalizationAngle",
  personalisatiehoek: "personalizationAngle",
  personalization: "personalizationAngle",
  personalisatie: "personalizationAngle",
  bron: "sourceUrl",
  "bron-url": "sourceUrl",
  sourceurl: "sourceUrl",
  url: "sourceUrl",
  "eerste-e-mail": "firstEmailSentAt",
  "datum eerste e-mail": "firstEmailSentAt",
  firstemaildate: "firstEmailSentAt",
  datum: "firstEmailSentAt",
  "gmail message id": "gmailMessageId",
  messageid: "gmailMessageId",
  gmailmessageid: "gmailMessageId",
  berichtid: "gmailMessageId",
  notities: "notes",
  notes: "notes",
  opmerkingen: "notes",
};

export type ProspectRowSource =
  | { type: "json"; rows: ProspectImportRow[] }
  | { type: "csv"; text: string }
  | { type: "xlsx"; buffer: ArrayBuffer }
  | { type: "rawRows"; rows: Record<string, unknown>[] };

/** Parse een CSV-tekst naar generieke rijen (headers in eerste regel). */
export function parseCsvToRows(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]!).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header.length > 0) row[header] = cells[index] ?? "";
    });
    return row;
  });
}

/** Simpele CSV-splitter met dubbele quotes. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

/** Lees XLSX (eerste sheet) naar generieke rijen. */
export function parseXlsxToRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  return raw;
}

/**
 * Map generieke rijen (headers) naar ProspectImportRow via aliastabel.
 * Rijen zonder bedrijfsnaam of zonder e-mail/website worden gemarkeerd en
 * overgeslagen (nooit raden).
 */
export function mapRowsToImport(
  rows: Record<string, unknown>[],
): { row: ProspectImportRow; raw: Record<string, unknown> }[] {
  return rows.map((raw) => {
    const row: ProspectImportRow = { companyName: "" };
    for (const [header, value] of Object.entries(raw)) {
      const key = header.trim().toLowerCase().replace(/\s+/g, " ");
      const field = IMPORT_HEADER_ALIASES[key];
      if (!field) continue;
      if (value === undefined || value === null || value === "") continue;
      if (field === "leadScore") {
        const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
        row.leadScore = Number.isFinite(n) ? n : null;
      } else {
        // Schrijf alleen bekende, type-veilige velden (interface zonder
        // index-signatuur). Ongeldige prioriteit wordt genegeerd.
        const text = typeof value === "string" ? value.trim() : String(value);
        switch (field) {
          case "companyName":
            row.companyName = text;
            break;
          case "industry":
            row.industry = text;
            break;
          case "city":
            row.city = text;
            break;
          case "website":
            row.website = text;
            break;
          case "email":
            row.email = text;
            break;
          case "phone":
            row.phone = text;
            break;
          case "personalizationAngle":
            row.personalizationAngle = text;
            break;
          case "sourceUrl":
            row.sourceUrl = text;
            break;
          case "firstEmailSentAt":
            row.firstEmailSentAt = text;
            break;
          case "gmailMessageId":
            row.gmailMessageId = text;
            break;
          case "notes":
            row.notes = text;
            break;
          case "priority": {
            const upper = text.toUpperCase();
            if (upper === "LOW" || upper === "MEDIUM" || upper === "HIGH") {
              row.priority = upper;
            }
            break;
          }
          default:
            break;
        }
      }
    }
    return { row, raw };
  });
}

/**
 * Duplicaat-lookup: retourneert per genormaliseerd e-mailadres en per
 * genormaliseerd domein de prospect_id van een bestaand record (of null).
 * - email  = prospect_id wanneer dat e-mailadres al bestaat;
 * - domain = prospect_id wanneer dat domein al bestaat.
 */
export type ImportLookup = (
  emailNormalized: string | null,
  domainNormalized: string | null,
) => Promise<{ email: string | null; domain: string | null }>;

/**
 * Classificeer één importrij (dry-run-logica, geen writes).
 *  - lege bedrijfsnaam            -> MISSING_COMPANY_NAME;
 *  - geen e-mail én geen website  -> NO_CONTACT_IDENTIFIER;
 *  - ongeldig e-mailadres         -> INVALID_EMAIL (alleen als wél opgegeven);
 *  - duplicate op e-mail          -> DUPLICATE_EMAIL;
 *  - duplicate op domein          -> DUPLICATE_DOMAIN;
 *  - anders                       -> NEW.
 */
export async function classifyImportRow(
  row: ProspectImportRow,
  lookup: ImportLookup,
): Promise<{ verdict: ImportVerdict; emailNormalized: string | null; domainNormalized: string | null }> {
  if (!row.companyName || row.companyName.trim().length === 0) {
    return { verdict: { outcome: "MISSING_COMPANY_NAME" }, emailNormalized: null, domainNormalized: null };
  }

  const emailNormalized = normalizeEmail(row.email);
  if (row.email && row.email.trim().length > 0 && !emailNormalized) {
    return { verdict: { outcome: "INVALID_EMAIL" }, emailNormalized: null, domainNormalized: null };
  }

  const website = row.website && row.website.trim().length > 0 ? row.website : null;
  if (!emailNormalized && !domainFromWebsite(website)) {
    return { verdict: { outcome: "NO_CONTACT_IDENTIFIER" }, emailNormalized: null, domainNormalized: null };
  }

  const domainNormalized = resolveDomainNormalized({ emailNormalized, website });
  const existing = await lookup(emailNormalized, domainNormalized);
  if (emailNormalized && existing.email) {
    return {
      verdict: { outcome: "DUPLICATE_EMAIL", existingProspectId: existing.email },
      emailNormalized,
      domainNormalized,
    };
  }
  if (domainNormalized && existing.domain) {
    return {
      verdict: { outcome: "DUPLICATE_DOMAIN", existingProspectId: existing.domain },
      emailNormalized,
      domainNormalized,
    };
  }
  return { verdict: { outcome: "NEW" }, emailNormalized, domainNormalized };
}

/** Dry-run: classificeer álle rijen zonder iets te schrijven. */
export async function classifyImport(
  rows: { row: ProspectImportRow; rowNumber: number }[],
  lookup: ImportLookup,
): Promise<ProspectImportReport> {
  const report: ProspectImportReportRow[] = [];
  let newCount = 0;
  let duplicateCount = 0;
  let skippedCount = 0;

  for (const { row, rowNumber } of rows) {
    const { verdict, emailNormalized, domainNormalized } = await classifyImportRow(row, lookup);
    const reportRow: ProspectImportReportRow = {
      rowNumber,
      companyName: row.companyName ?? "",
      emailNormalized,
      domainNormalized,
      verdict,
    };
    report.push(reportRow);
    if (verdict.outcome === "NEW") newCount += 1;
    else if (verdict.outcome.startsWith("DUPLICATE_")) duplicateCount += 1;
    else skippedCount += 1;
  }

  return {
    dryRun: true,
    totalRows: rows.length,
    newCount,
    duplicateCount,
    skippedCount,
    rows: report,
  };
}

/** Default-lookup tegen de database (productie). */
export function createDatabaseImportLookup(
  sql: ProspectSql,
  tenantId: string,
): ImportLookup {
  return async (emailNormalized, domainNormalized) => {
    const byEmail = emailNormalized
      ? await findProspectByEmail(sql, tenantId, emailNormalized)
      : null;
    const byDomain = domainNormalized
      ? await findProspectByDomain(sql, tenantId, domainNormalized)
      : null;
    return {
      email: byEmail ? byEmail.prospectId : null,
      domain: byDomain ? byDomain.prospectId : null,
    };
  };
}

export interface ExecuteImportResult {
  inserted: number;
  skipped: { rowNumber: number; companyName: string; reason: string }[];
}

export interface ExecuteImportOptions {
  /** Duplicaat-lookup; default = database-lookup voor deze tenant. */
  lookup?: ImportLookup;
}

/**
 * Voer de import uit: alleen rijen met verdict NEW worden ingevoegd, met
 * status FIRST_EMAIL_SENT (deze prospects zijn al gemaild; er wordt niets
 * verzonden). Duplicaten worden overgeslagen. Geen e-mail, geen externe calls.
 */
export async function executeImport(
  sql: ProspectSql,
  tenantId: string,
  rows: { row: ProspectImportRow; rowNumber: number }[],
  options: ExecuteImportOptions = {},
): Promise<ExecuteImportResult> {
  const lookup = options.lookup ?? createDatabaseImportLookup(sql, tenantId);
  const inserted: string[] = [];
  const skipped: ExecuteImportResult["skipped"] = [];

  for (const { row, rowNumber } of rows) {
    const { verdict, emailNormalized, domainNormalized } = await classifyImportRow(row, lookup);
    if (verdict.outcome !== "NEW") {
      skipped.push({
        rowNumber,
        companyName: row.companyName ?? "",
        reason: verdict.outcome,
      });
      continue;
    }
    const website = row.website && row.website.trim().length > 0 ? row.website.trim() : null;
    const prospectId = await createProspect(sql, {
      tenantId,
      companyName: row.companyName,
      emailNormalized,
      domainNormalized,
      industry: row.industry || null,
      city: row.city || null,
      website,
      email: emailNormalized, // alleen genormaliseerd opslaan (geen variatie)
      phone: row.phone || null,
      leadScore: row.leadScore ?? null,
      priority: row.priority ?? null,
      personalizationAngle: row.personalizationAngle || null,
      sourceUrl: row.sourceUrl || null,
      status: "FIRST_EMAIL_SENT",
      contactAttempts: 1,
      firstEmailSentAt: row.firstEmailSentAt || null,
      gmailMessageId: row.gmailMessageId || null,
      notes: row.notes || null,
    });
    inserted.push(prospectId);
  }

  return {
    inserted: inserted.length,
    skipped,
  };
}
