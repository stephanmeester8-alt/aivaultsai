import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

try {
  const tables = ["leads", "lead_events", "lead_qualifications"];

  for (const table of tables) {
    console.log(`\n=== ${table} ===`);

    const rows = await sql`
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = ${table}
      ORDER BY ordinal_position
    `;

    console.table(rows);
  }
} finally {
  await sql.end();
}
