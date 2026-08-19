import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

try {
  const leads = await sql`
    SELECT *
    FROM leads
    ORDER BY created_at DESC
    LIMIT 10
  `;

  console.log("EXISTING LEADS");
  console.table(leads);
} finally {
  await sql.end();
}
