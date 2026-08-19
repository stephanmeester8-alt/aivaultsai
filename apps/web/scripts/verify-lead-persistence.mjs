import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

try {
  const rows = await sql`
    SELECT
      lead_id,
      conversation_id,
      status,
      source,
      intent,
      name,
      company,
      email,
      created_at
    FROM leads
    ORDER BY created_at DESC
    LIMIT 5
  `;

  console.table(rows);
} finally {
  await sql.end();
}
