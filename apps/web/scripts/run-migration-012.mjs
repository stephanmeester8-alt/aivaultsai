// Migration runner for 012_tenant_runtime_ownership.sql (Sprint 4).
// Reads DATABASE_URL from apps/web/.env.local WITHOUT printing it.
// Executes the idempotent, non-destructive migration statement by statement
// and verifies tenant_id columns + NOT NULL on all 002-runtime tables.
// No DROP, no reset, no deletes.
//
// NOTE (cutover): deze migratie hoort bij de geplande productiecutover
// (fase: DB-schema vóór de deploy; NOT NULL pas nadat nieuwe code live is —
// de cutover-run kan de statements selectief uitvoeren). Niet zomaar draaien
// tegen productie.
//
// Usage: node scripts/run-migration-012.mjs   (from apps/web)
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

const REQUIRED = {
  agent_runs: true,
  runtime_tasks: true,
  runtime_approvals: true,
  runtime_executions: true,
  runtime_evidence: true,
  runtime_handoffs: true,
};

async function main() {
  const databaseUrl = loadDatabaseUrl();
  const sql = postgres(databaseUrl, { prepare: false, max: 2 });

  try {
    const dbName = await sql`SELECT current_database() AS name`;
    console.log(`Connected to database: ${dbName[0].name}`);

    const migrationPath = resolve(process.cwd(), "lib/db/migrations/012_tenant_runtime_ownership.sql");
    const migrationSql = readFileSync(migrationPath, "utf8");
    const statements = splitStatements(migrationSql);
    console.log(`Migration statements to execute: ${statements.length}`);

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
    for (const [table, required] of Object.entries(REQUIRED)) {
      const cols = await sql`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = 'tenant_id'
        LIMIT 1
      `;
      const nullable = cols[0]?.is_nullable;
      if (nullable === undefined) {
        console.error(`  MISSING tenant_id on ${table}`);
        failures += 1;
      } else if (required && nullable !== "NO") {
        console.error(`  NOT NULL ontbreekt op ${table} (is_nullable=${nullable})`);
        failures += 1;
      } else {
        console.log(`  ok   ${table}.tenant_id NOT NULL=${nullable === "NO"}`);
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
