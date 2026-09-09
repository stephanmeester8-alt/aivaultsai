import { NextResponse } from "next/server";
import {
  getSiteTenantId,
  readJson,
  requireAdminKey,
} from "@/lib/prospect-pipeline/admin-auth";

export const runtime = "nodejs";

type ReplyPayload = {
  prospectId: string;
  classification?: unknown;
  summary?: unknown;
  nextAction?: unknown;
  gmailMessageId?: unknown;
  gmailThreadId?: unknown;
  receivedAt?: unknown;
};

function validReplyBody(value: unknown): value is ReplyPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (typeof body.prospectId !== "string" || body.prospectId.trim().length === 0) {
    return false;
  }
  for (const key of ["summary", "nextAction", "gmailMessageId", "gmailThreadId", "receivedAt"]) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== "string") {
      return false;
    }
  }
  return true;
}

/**
 * Admin-only: registreer één handmatig geregistreerde reactie (v1, geen
 * Gmail-API). Zet de prospect op REPLIED (of DO_NOT_CONTACT/LOST) en
 * blokkeert automatische opvolging. Bij INTERESTED wordt een persoonlijk
 * antwoordconcept (demo 15 min) klaargezet als DRAFT — verzending vereist
 * een afzonderlijke approval. Geen automatische beantwoording.
 */
export async function POST(request: Request) {
  const denied = requireAdminKey(request);
  if (denied) return denied;

  let data: unknown;
  try {
    data = await readJson(request);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!validReplyBody(data)) {
    return NextResponse.json({ error: "Invalid reply request." }, { status: 400 });
  }

  try {
    const tenantId = getSiteTenantId();
    const { sql } = await import("@/lib/db/client");
    const { getProspect } = await import("@/lib/prospect-pipeline/repository");
    const { isValidReplyClass, registerManualReply } = await import(
      "@/lib/prospect-pipeline/reply"
    );

    if (data.classification === undefined || !isValidReplyClass(data.classification)) {
      return NextResponse.json(
        {
          error:
            "Ongeldige classificatie. Toegestaan: INTERESTED, QUESTION, NOT_NOW, NOT_INTERESTED, UNSUBSCRIBE, UNKNOWN.",
        },
        { status: 400 },
      );
    }

    const prospect = await getProspect(sql as never, tenantId, data.prospectId);
    if (!prospect) {
      return NextResponse.json(
        { error: "Prospect niet gevonden." },
        { status: 404 },
      );
    }

    const expectedFrom =
      process.env.LEAD_FROM_EMAIL?.trim() || "info@aivaultsai.nl";

    const result = await registerManualReply(sql as never, prospect, {
      tenantId,
      prospectId: prospect.prospectId,
      classification: data.classification,
      summary: data.summary === null || data.summary === undefined
        ? undefined
        : String(data.summary),
      nextAction: data.nextAction === null || data.nextAction === undefined
        ? undefined
        : String(data.nextAction),
      gmailMessageId:
        data.gmailMessageId === null || data.gmailMessageId === undefined
          ? undefined
          : String(data.gmailMessageId),
      gmailThreadId:
        data.gmailThreadId === null || data.gmailThreadId === undefined
          ? undefined
          : String(data.gmailThreadId),
      receivedAt:
        data.receivedAt === null || data.receivedAt === undefined
          ? undefined
          : String(data.receivedAt),
      expectedFromAddress: expectedFrom,
    });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    console.error(
      "[prospect-admin] reply registration failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json(
      { error: "Reactie kon niet worden geregistreerd." },
      { status: 500 },
    );
  }
}
