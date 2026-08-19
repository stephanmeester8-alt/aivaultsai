import { NextResponse } from "next/server";
import { createLead } from "@/lib/customer-zero/persistence/lead-repository";

export const runtime = "nodejs";

export async function POST() {
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