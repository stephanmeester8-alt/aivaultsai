import { NextResponse } from "next/server";
import { createLead } from "../../../../lib/customer-zero/persistence/lead-repository.ts";
import { isTestEndpointEnabled } from "../../../../lib/customer-zero/test-endpoint-guard.ts";

export const runtime = "nodejs";

/**
 * Test endpoint — DEVELOPMENT/TEST ONLY (TASK 25 hardening).
 * Answers 404 in any non-development environment and never touches the
 * database then. In local development it writes a controlled test lead.
 */
export async function POST() {
  if (!isTestEndpointEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const lead = await createLead({
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

    return NextResponse.json({
      ok: true,
      lead,
    });
  } catch (error) {
    console.error("Customer Zero lead persistence test failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Lead persistence test failed.",
      },
      { status: 500 },
    );
  }
}
