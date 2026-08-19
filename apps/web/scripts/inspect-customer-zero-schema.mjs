import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

try {
  for (const table of [
    "leads",
    "conversations",
    "lead_events",
    "appointments",
  ]) {
    console.log(`\n=== ${table} ===`);

    const columns = await sql`
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = ${table}
      ORDER BY ordinal_position
    `;

    console.table(columns);
  }
} finally {
  await sql.end();
}