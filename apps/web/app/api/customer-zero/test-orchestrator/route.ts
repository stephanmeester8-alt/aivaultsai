import { NextResponse } from "next/server";
import postgres from "postgres";
import { runCustomerZeroOrchestrator } from "@/lib/customer-zero/orchestrator";
import { getSiteTenantId } from "@/lib/tenancy";
import { isTestEndpointEnabled } from "@/lib/customer-zero/test-endpoint-guard";

export const runtime = "nodejs";

/**
 * Test endpoint — DEVELOPMENT/TEST ONLY (zelfde guard als test-lead).
 * Answers 404 in any non-development environment and never touches the
 * database then.
 */
export async function POST() {
  if (!isTestEndpointEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let sql: ReturnType<typeof postgres> | null = null;

  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL ontbreekt.");
    }

    sql = postgres(process.env.DATABASE_URL);

    // Tenant server-side geresolveerd (NO TENANT = NO EXECUTION, Sprint 3).
    const tenantId = getSiteTenantId();

    const conversationRows = await sql`
      INSERT INTO conversations (tenant_id) VALUES (${tenantId}::uuid)
      RETURNING id
    `;

    const conversationId = conversationRows[0]?.id;

    if (!conversationId) {
      throw new Error("Kon geen conversation aanmaken.");
    }

    const result = await runCustomerZeroOrchestrator({
      tenantId,
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
