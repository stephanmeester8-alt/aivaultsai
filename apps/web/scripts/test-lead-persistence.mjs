import postgres from "postgres";
import { createLead } from "../lib/customer-zero/persistence/lead-repository.ts";

const sql = postgres(process.env.DATABASE_URL);

try {
  const conversation = await sql`
    SELECT conversation_id
    FROM conversations
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!conversation[0]) {
    throw new Error("No conversation exists for lead persistence test.");
  }

  const conversationId = conversation[0].conversation_id;

  console.log("Using conversation:", conversationId);

  const lead = await createLead({
    conversationId,
    status: "QUALIFIED",
    source: "ai_assistant",
    intent: "appointment",
    name: "Customer Zero Persistence Test",
    company: "AIVaultsAI Test",
    email: "persistence-test@example.com",
    phone: "0612345678",
    industry: "AI / Software",
    problem: "Leadopvolging en afspraakplanning",
    desiredOutcome: "Automatische leadopvang en afspraken",
    preferredContactMethod: "phone",
    metadata: {
      test: true,
      testType: "lead-persistence",
    },
  });

  console.log("\nCREATED LEAD");
  console.dir(lead, { depth: null });
} finally {
  await sql.end();
}
