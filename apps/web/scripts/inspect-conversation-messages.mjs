import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

const conversationId =
  "0e343e4a-f4f5-4eb4-90f3-845cccf8fe05";

try {
  const messages = await sql`
    SELECT
      message_id,
      conversation_id,
      role,
      content,
      created_at
    FROM conversation_messages
    WHERE conversation_id = ${conversationId}::uuid
    ORDER BY created_at ASC
  `;

  console.log("CONVERSATION MESSAGES");
  console.table(messages);
} finally {
  await sql.end();
}
