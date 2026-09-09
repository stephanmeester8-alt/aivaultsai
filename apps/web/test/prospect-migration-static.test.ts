import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildDailyActions } from "../lib/prospect-pipeline/daily-actions.ts";
import { memorySql, TENANT } from "./prospect-fixtures.ts";

test("daily actions: lege pipeline retourneert nul-tellingen", async () => {
  const { sql } = memorySql();
  const actions = await buildDailyActions(sql, TENANT, new Date("2026-01-08T09:00:00.000Z"));
  assert.equal(actions.counts.new, 0);
  assert.equal(actions.counts.replies, 0);
  assert.equal(actions.date, "2026-01-08");
  assert.deepEqual(actions.newProspects, []);
  assert.deepEqual(actions.doNotContact, []);
});

test("migratie 013 is additief: geen DROP TABLE, ALTER van bestaand, DELETE of TRUNCATE", () => {
  const file = resolve(process.cwd(), "lib/db/migrations/013_prospect_pipeline.sql");
  const sqlText = readFileSync(file, "utf8");

  assert.match(sqlText, /CREATE TABLE IF NOT EXISTS prospects/);
  assert.match(sqlText, /CREATE TABLE IF NOT EXISTS prospect_outreach/);
  assert.match(sqlText, /CREATE TABLE IF NOT EXISTS prospect_replies/);

  // Veiligheid: alleen nieuwe objecten; niets bestaands verwijderen.
  assert.doesNotMatch(sqlText, /\bDROP TABLE\b/i);
  assert.doesNotMatch(sqlText, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sqlText, /\bDELETE FROM\b/i);
  // De enige ALTER-vorm is niet-destructief toevoegen van triggers op de
  // NIEUWE tabellen; er mag geen ALTER TABLE op bestaande kernobjecten staan.
  assert.doesNotMatch(sqlText, /ALTER TABLE (conversations|leads|leads_events|appointments|companies)\b/i);
});

test("migratie 013 bevat tenant-koppeling en unieke constraints", () => {
  const file = resolve(process.cwd(), "lib/db/migrations/013_prospect_pipeline.sql");
  const sqlText = readFileSync(file, "utf8");
  assert.match(sqlText, /REFERENCES prospect_tenants\(tenant_id\)/);
  assert.match(sqlText, /uq_prospects_tenant_email_normalized/);
  assert.match(sqlText, /uq_prospects_tenant_domain_normalized/);
  assert.match(sqlText, /prospect_outreach_one_per_kind/);
});

test("migratie 013 declareert de 15 statussen en 6 reply-klassen", () => {
  const file = resolve(process.cwd(), "lib/db/migrations/013_prospect_pipeline.sql");
  const sqlText = readFileSync(file, "utf8");

  const expected = [
    "NEW", "RESEARCHED", "READY_FOR_OUTREACH", "FIRST_EMAIL_SENT",
    "WAITING_FOR_REPLY", "REPLIED", "FOLLOW_UP_DUE", "FOLLOW_UP_DRAFTED",
    "CALL_DUE", "DEMO_OFFERED", "DEMO_SCHEDULED", "WON", "LOST",
    "DO_NOT_CONTACT", "BOUNCED",
  ];
  for (const s of expected) assert.match(sqlText, new RegExp(`'${s}'`));

  for (const c of ["INTERESTED", "QUESTION", "NOT_NOW", "NOT_INTERESTED", "UNSUBSCRIBE", "UNKNOWN"]) {
    assert.match(sqlText, new RegExp(`'${c}'`));
  }
});
