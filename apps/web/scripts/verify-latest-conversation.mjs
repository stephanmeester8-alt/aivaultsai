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

try {
  console.log("Checking latest Customer Zero conversation...");
  console.log("");

  const conversations = await sql`
    SELECT
      conversation_id,
      source,
      created_at,
      last_activity_at
    FROM conversations
    ORDER BY created_at DESC
    LIMIT 1;
  `;

  if (conversations.length === 0) {
    console.error("No conversations found.");
    process.exitCode = 1;
  } else {
    const conversation = conversations[0];

    console.log("Latest conversation:");
    console.log(`conversation_id: ${conversation.conversation_id}`);
    console.log(`source:          ${conversation.source}`);
    console.log(`created_at:      ${conversation.created_at}`);
    console.log(`last_activity:   ${conversation.last_activity_at}`);
    console.log("");

    const messages = await sql`
      SELECT
        sequence_number,
        role,
        content,
        created_at
      FROM conversation_messages
      WHERE conversation_id = ${conversation.conversation_id}::uuid
      ORDER BY sequence_number ASC;
    `;

    console.log(`Messages found: ${messages.length}`);
    console.log("");

    for (const message of messages) {
      console.log(
        `[${message.sequence_number}] ${message.role.toUpperCase()}`,
      );
      console.log(message.content);
      console.log("");
    }

    const events = await sql`
      SELECT
        event_type,
        source,
        origin,
        occurred_at
      FROM lead_events
      WHERE conversation_id = ${conversation.conversation_id}::uuid
      ORDER BY occurred_at ASC;
    `;

    console.log(`Lead events found: ${events.length}`);
    console.log("");

    for (const event of events) {
      console.log(
        `${event.occurred_at} | ${event.event_type} | source=${event.source} | origin=${event.origin}`,
      );
    }

    console.log("");
    console.log("Customer Zero conversation verification completed.");
  }
} catch (error) {
  console.error("Conversation verification failed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await sql.end();
}