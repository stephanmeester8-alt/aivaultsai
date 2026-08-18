import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("ERROR: DATABASE_URL is not configured.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
});

const expectedTables = [
  "conversations",
  "conversation_messages",
  "leads",
  "lead_events",
  "lead_qualifications",
  "appointments",
];

try {
  console.log("Checking Customer Zero database schema...");
  console.log("");

  const result = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;

  const existingTables = new Set(
    result.map((row) => row.table_name),
  );

  console.log("Expected Customer Zero tables:");

  let allTablesExist = true;

  for (const table of expectedTables) {
    const exists = existingTables.has(table);

    console.log(`${exists ? "✓" : "✗"} ${table}`);

    if (!exists) {
      allTablesExist = false;
    }
  }

  console.log("");

  if (!allTablesExist) {
    console.error("Schema verification failed.");

    const missingTables = expectedTables.filter(
      (table) => !existingTables.has(table),
    );

    console.error("Missing tables:");
    console.error(missingTables.join(", "));

    process.exitCode = 1;
  } else {
    console.log("Customer Zero schema verified successfully.");
  }
} catch (error) {
  console.error("Schema verification failed.");
  console.error(error);

  process.exitCode = 1;
} finally {
  await sql.end();
}