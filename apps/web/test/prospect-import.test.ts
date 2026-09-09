import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";

import {
  classifyImport,
  createDatabaseImportLookup,
  executeImport,
  mapRowsToImport,
  parseCsvToRows,
  parseXlsxToRows,
} from "../lib/prospect-pipeline/import.ts";
import { memorySql, TENANT } from "./prospect-fixtures.ts";
import type { ProspectImportRow } from "../lib/prospect-pipeline/types.ts";

function row(n: number, data: Partial<ProspectImportRow>): { row: ProspectImportRow; rowNumber: number } {
  return {
    rowNumber: n,
    row: {
      companyName: "Onbekend",
      ...data,
    },
  };
}

/** lookup-stub zonder bestaande prospecten. */
const EMPTY_LOOKUP = async () => ({ email: null, domain: null });

/** lookup-stub: één bestaande prospect op e-mail en één op domein. */
function existingLookup(): Parameters<typeof classifyImport>[1] {
  return async (emailNormalized, domainNormalized) => {
    if (emailNormalized === "info@bestaat.nl") return { email: "p-bestaat-email", domain: null };
    if (domainNormalized === "bestaat.nl") return { email: null, domain: "p-bestaat-domein" };
    return { email: null, domain: null };
  };
}

test("parseCsvToRows: headers + waarden incl. quotes", () => {
  const csv = "Bedrijf,Email,Website\n\"B.V. & Zn\",info@x.nl,https://x.nl\nTwee,twee@y.nl,https://y.nl";
  const rows = parseCsvToRows(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!["Bedrijf"], "B.V. & Zn");
  assert.equal(rows[1]!["Email"], "twee@y.nl");
});

test("mapRowsToImport: header-aliassen en leadscore", () => {
  const mapped = mapRowsToImport([
    { bedrijfsnaam: "X", email: "INFO@X.NL", score: "70", website: "https://x.nl" },
  ]);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0]!.row.companyName, "X");
  assert.equal(mapped[0]!.row.email, "INFO@X.NL");
  assert.equal(mapped[0]!.row.leadScore, 70);
});

test("parseXlsxToRows: leest eerste sheet", () => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Bedrijf", "Email"],
    ["XLSX BV", "info@xlsx.nl"],
    ["Twee BV", "info@twee.nl"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer;
  const rows = parseXlsxToRows(buffer);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!["Bedrijf"], "XLSX BV");
});

test("dry-run: nieuwe prospects worden NEW gemarkeerd", async () => {
  const report = await classifyImport(
    [row(1, { companyName: "Nieuw BV", email: "info@nieuw.nl", website: "https://nieuw.nl" })],
    EMPTY_LOOKUP,
  );
  assert.equal(report.newCount, 1);
  assert.equal(report.rows[0]!.verdict.outcome, "NEW");
});

test("dry-run: duplicate op genormaliseerd e-mailadres", async () => {
  const report = await classifyImport(
    [
      row(1, { companyName: "Nieuw BV", email: "info@nieuw.nl" }),
      row(2, { companyName: "Dupe BV", email: "INFO@BESTAAT.NL" }), // zelfde email, andere case
    ],
    existingLookup(),
  );
  assert.equal(report.rows[1]!.verdict.outcome, "DUPLICATE_EMAIL");
  assert.equal(report.duplicateCount, 1);
  assert.equal(report.newCount, 1);
});

test("dry-run: duplicate op genormaliseerd domein (via website)", async () => {
  const report = await classifyImport(
    [row(1, { companyName: "Zelfde Domein", email: "ander@bestaat.nl", website: "https://www.BESTAAT.nl" })],
    existingLookup(),
  );
  assert.equal(report.rows[0]!.verdict.outcome, "DUPLICATE_DOMAIN");
});

test("dry-run: ongeldige rijen worden gemarkeerd, nooit geraden", async () => {
  const report = await classifyImport(
    [
      row(1, { companyName: "Geen bedrijf" }),
      row(2, { companyName: "Leeg veld", email: "" }),
      row(3, { companyName: "Slecht mail", email: "geen-mail" }),
    ],
    EMPTY_LOOKUP,
  );
  assert.equal(report.skippedCount, 3);
  assert.equal(report.rows[0]!.verdict.outcome, "NO_CONTACT_IDENTIFIER");
  assert.equal(report.rows[2]!.verdict.outcome, "INVALID_EMAIL");
});

test("executeImport: voegt alleen NEW in met status FIRST_EMAIL_SENT (geen e-mail)", async () => {
  const { sql, calls } = memorySql();
  // Duplicaat-lookup: info@eerste.nl bestaat al (tweede rij is dus een duplicaat).
  const lookup = async (emailNormalized: string | null, domainNormalized: string | null) => {
    if (emailNormalized === "info@eerste.nl") return { email: "p-bestaand", domain: null };
    if (domainNormalized === "eerste.nl") return { email: null, domain: "p-bestaand-domein" };
    return { email: null, domain: null };
  };
  const result = await executeImport(
    sql,
    TENANT,
    [
      row(1, { companyName: "Eerste BV", email: "info@eerste.nl", website: "https://eerste.nl" }),
      row(2, { companyName: "Dupe BV", email: "info@eerste.nl" }), // duplicate email -> skip
    ],
    { lookup },
  );
  assert.equal(result.inserted, 0);
  assert.equal(result.skipped.length, 2);
  assert.equal(result.skipped[0]!.reason, "DUPLICATE_EMAIL");
  assert.equal(result.skipped[1]!.reason, "DUPLICATE_EMAIL");

  // Er is géén INSERT omdat alle rijen duplicaat zijn; géén send-oproep.
  const insertCall = calls.find((c) => c.text.includes("INSERT INTO prospects"));
  assert.equal(insertCall, undefined);
});

test("executeImport: nieuwe rij wordt ingevoegd met FIRST_EMAIL_SENT en tenant-first", async () => {
  const { sql, calls } = memorySql();
  const result = await executeImport(
    sql,
    TENANT,
    [row(1, { companyName: "Nieuw BV", email: "info@nieuw.nl", website: "https://nieuw.nl" })],
    { lookup: EMPTY_LOOKUP },
  );
  assert.equal(result.inserted, 1);
  assert.equal(result.skipped.length, 0);

  const insertCall = calls.find((c) => c.text.includes("INSERT INTO prospects"));
  assert.ok(insertCall, "verwacht een INSERT INTO prospects");
  assert.equal(insertCall!.values[0], TENANT, "tenant_id is eerste waarde");
  assert.ok(
    insertCall!.values.includes("FIRST_EMAIL_SENT"),
    "geïmporteerde prospect heeft status FIRST_EMAIL_SENT (al gemaild; nooit opnieuw)",
  );
});

test("createDatabaseImportLookup: geen bestaande -> beide null", async () => {
  const { sql } = memorySql();
  const lookup = createDatabaseImportLookup(sql, TENANT);
  const hit = await lookup("info@onbekend.nl", "onbekend.nl");
  assert.deepEqual(hit, { email: null, domain: null });
});
