// Migration runner for 009_shop.sql (webshop).
// Reads DATABASE_URL from apps/web/.env.local WITHOUT printing it.
// Executes the idempotent, non-destructive migration statement by statement
// and verifies the resulting tables/indexes. No DROP, no reset, no deletes.
//
// Usage: node scripts/run-migration-009.mjs   (from apps/web)
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

async function main() {
  const databaseUrl = loadDatabaseUrl();
  const sql = postgres(databaseUrl, { prepare: false, max: 2 });

  try {
    const dbName = await sql`SELECT current_database() AS name`;
    console.log(`Connected to database: ${dbName[0].name}`);

    const existingTables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const names = existingTables.map((r) => r.table_name);
    console.log("Existing tables:", names.join(", "));

    if (!names.includes("conversations")) {
      console.error(
        "WARNING: migration 001 (customer_zero) appears NOT applied on this database.",
      );
      console.error("Stopping before running 009 — do not migrate a half-initialized DB.");
      return;
    }

    const migrationPath = resolve(process.cwd(), "lib/db/migrations/009_shop.sql");
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

    const requiredTables = ["shop_products", "shop_orders"];
    const after = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${requiredTables})
      ORDER BY table_name
    `;
    const afterNames = after.map((r) => r.table_name);
    const missing = requiredTables.filter((t) => !afterNames.includes(t));
    console.log("");
    console.log(`Shop tables present: ${afterNames.length}/${requiredTables.length}`);
    if (missing.length > 0) {
      console.error("MISSING:", missing.join(", "));
      process.exitCode = 1;
    } else {
      const product = await sql`
        SELECT slug, price_cents, currency
        FROM shop_products
        WHERE slug = 'ai-assistent-pakket'
        LIMIT 1
      `;
      console.log("Seeded product:", JSON.stringify(product[0] ?? null));
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
