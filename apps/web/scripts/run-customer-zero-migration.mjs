import postgres from "postgres";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationPath = path.resolve(
  __dirname,
  "../lib/db/migrations/001_customer_zero.sql",
);

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL is not configured.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
});

try {
  console.log("Loading migration:");
  console.log(migrationPath);

  const migration = await readFile(migrationPath, "utf8");

  if (!migration.trim()) {
    throw new Error("Migration file is empty.");
  }

  console.log(`Migration size: ${migration.length} characters`);
  console.log("Connecting to PostgreSQL...");
  console.log("Executing migration...");

  await sql.unsafe(migration);

  console.log("");
  console.log("Customer Zero migration completed successfully.");
} catch (error) {
  console.error("");
  console.error("Customer Zero migration failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await sql.end();
}