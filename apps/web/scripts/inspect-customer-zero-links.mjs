import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

try {
  const leads = await sql`
    SELECT lead_id, status, source, intent, created_at
    FROM leads
    ORDER BY created_at DESC
    LIMIT 5
  `;

  console.log("LEADS");
  console.table(leads);

  const conversations = await sql`
    SELECT conversation_id, lead_id, created_at
    FROM conversations
    ORDER BY created_at DESC
    LIMIT 5
  `;

  console.log("CONVERSATIONS");
  console.table(conversations);
} finally {
  await sql.end();
}
