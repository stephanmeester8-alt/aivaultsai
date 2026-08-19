import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

try {
  const conversations = await sql`
    SELECT *
    FROM conversations
    ORDER BY created_at DESC
    LIMIT 10
  `;

  console.log("EXISTING CONVERSATIONS");
  console.table(conversations);
} finally {
  await sql.end();
}
