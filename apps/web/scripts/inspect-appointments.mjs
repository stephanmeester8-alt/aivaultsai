import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

try {
  const rows = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'appointments'
    ORDER BY ordinal_position
  `;

  console.table(rows);
} finally {
  await sql.end();
}
