// Migration runner for 013_prospect_pipeline.sql (prospect-acquisitie).
// Reads DATABASE_URL from apps/web/.env.local WITHOUT printing it.
// Executes the idempotent, additive migration statement by statement and
// verifies the new tables/indexes. No DROP of existing tables, no reset,
// no deletes.
//
// SAFETY: alleen uitvoeren op de ontwikkelomgeving en PAS nadat de SQL door
// Stephan is goedgekeurd. Er wordt geen e-mail verstuurd en geen externe
// provider aangeroepen.
//
// Usage:
//   node scripts/run-migration-013.mjs            (uitvoeren)
//   node scripts/run-migration-013.mjs --dry-run  (alleen statements tonen)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

function loadDatabaseUrl() {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m && m[1].length > 0) return m[1].trim();
  }
  throw new Error("DATABASE_URL not found in .env.local");
}

/** Split SQL on top-level semicolons, ignoring $$…$$, quotes and comments. */
function splitStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") {
        current += sql[i];
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      current += "/*";
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) {
        current += sql[i];
        i += 1;
      }
      if (i < n) {
        current += "*/";
        i += 2;
      }
      continue;
    }
    if (ch === "'") {
      current += ch;
      i += 1;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "''";
          i += 2;
        } else if (sql[i] === "'") {
          current += "'";
          i += 1;
          break;
        } else {
          current += sql[i];
          i += 1;
        }
      }
      continue;
    }
    if (ch === '"') {
      current += ch;
      i += 1;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          current += '""';
          i += 2;
        } else if (sql[i] === '"') {
          current += '"';
          i += 1;
          break;
        } else {
          current += sql[i];
          i += 1;
        }
      }
      continue;
    }
    if (ch === "$") {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        current += tag;
        i += tag.length;
        const end = sql.indexOf(tag, i);
        if (end === -1) {
          current += sql.slice(i);
          i = n;
        } else {
          current += sql.slice(i, end + tag.length);
          i = end + tag.length;
        }
        continue;
      }
    }
    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);
  return statements;
}

const EXPECTED_TABLES = ["prospects", "prospect_outreach", "prospect_replies"];
const EXPECTED_INDEXES = [
  "uq_prospects_tenant_email_normalized",
  "uq_prospects_tenant_domain_normalized",
  "prospect_outreach_one_per_kind",
];

/** Bevat een statement daadwerkelijk SQL (of alleen commentaar)? */
function isMeaningfulSql(statement) {
  return statement
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim().length > 0;
}

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const migrationPath = resolve(
    process.cwd(),
    "lib/db/migrations/013_prospect_pipeline.sql",
  );
  const migrationSql = readFileSync(migrationPath, "utf8");
  const statements = splitStatements(migrationSql).filter(isMeaningfulSql);

  if (DRY_RUN) {
    console.log(`DRY-RUN: ${statements.length} statements in 013_prospect_pipeline.sql`);
    for (let idx = 0; idx < statements.length; idx += 1) {
      const head = statements[idx].replace(/\s+/g, " ").slice(0, 90);
      console.log(`  [${idx + 1}] ${head}`);
    }
    console.log("Geen wijzigingen uitgevoerd.");
    return;
  }

  const databaseUrl = loadDatabaseUrl();
  const sql = postgres(databaseUrl, { prepare: false, max: 2 });

  try {
    const dbName = await sql`SELECT current_database() AS name`;
    console.log(`Connected to database: ${dbName[0].name}`);

    for (let idx = 0; idx < statements.length; idx += 1) {
      const statement = statements[idx];
      const head = statement.replace(/\s+/g, " ").slice(0, 60);
      try {
        await sql.unsafe(statement);
        console.log(`  ok   [${idx + 1}] ${head}`);
      } catch (error) {
        console.error(`  FAIL [${idx + 1}] ${head}`);
        console.error("  ", error instanceof Error ? error.message : String(error));
        throw error;
      }
    }

    console.log("");
    let failures = 0;
    for (const table of EXPECTED_TABLES) {
      const tbl = await sql`
        SELECT to_regclass(${"public." + table}) AS x
      `;
      if (!tbl[0]?.x) {
        console.error(`  MISSING table ${table}`);
        failures += 1;
      } else {
        console.log(`  ok   table ${table}`);
      }
    }
    for (const index of EXPECTED_INDEXES) {
      const idx = await sql`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ${index}
        LIMIT 1
      `;
      if (!idx[0]) {
        console.error(`  MISSING index ${index}`);
        failures += 1;
      } else {
        console.log(`  ok   index ${index}`);
      }
    }
    if (failures > 0) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
