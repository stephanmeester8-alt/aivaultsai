import { NextResponse } from "next/server";
import postgres from "postgres";
import { runCustomerZeroOrchestrator } from "@/lib/customer-zero/orchestrator";

export const runtime = "nodejs";

export async function POST() {
  let sql: ReturnType<typeof postgres> | null = null;

  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL ontbreekt.");
    }

    sql = postgres(process.env.DATABASE_URL);

    const conversationRows = await sql`
      INSERT INTO conversations DEFAULT VALUES
      RETURNING id
    `;

    const conversationId = conversationRows[0]?.id;

    if (!conversationId) {
      throw new Error("Kon geen conversation aanmaken.");
    }

    const result = await runCustomerZeroOrchestrator({
      conversationId,
      messages: [
        {
          role: "user",
          content:
            "Ik wil meer klanten binnenhalen en graag een kennismaking plannen.",
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      conversationId,
      result,
    });
  } catch (error) {
    console.error("Customer Zero orchestrator test failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Customer Zero orchestrator test failed.",
      },
      { status: 500 },
    );
  } finally {
    if (sql) {
      await sql.end();
    }
  }
}
