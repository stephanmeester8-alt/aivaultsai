import { NextResponse } from "next/server";
import postgres from "postgres";

import {
  MAX_BODY_BYTES,
  MAX_HISTORY_MESSAGES,
  MAX_OUTPUT_TOKENS,
  OPENAI_TIMEOUT_MS,
  buildModelInput,
  isValidUuid,
  normalizeHistory,
  parseAssistantRequest,
} from "@/lib/assistant/request";
import {
  createDefaultFunnelDeps,
  maybeRunCustomerZeroOrchestration,
} from "@/lib/customer-zero/assistant-funnel";
import {
  parseClientAttribution,
  type Attribution,
} from "@/lib/traffic/attribution";
import {
  readBearerToken,
  verifyAssistantApiKey,
} from "@/lib/assistant/auth";
import { RateLimiter } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `Je bent de commerciële AIVaultsAI-assistent op de publieke website.

Doel:
- Laat bezoekers ervaren hoe een zakelijke AI-assistent werkt.
- Leg concreet uit wat AIVaultsAI kan bouwen: websites, AI-assistenten, leadopvang, leadkwalificatie, afsprakenflows en procesautomatisering.
- Denk mee vanuit het bedrijf van de bezoeker en geef maximaal 3 concrete ideeën.
- Stel maximaal 2 gerichte vervolgvragen als die nodig zijn.
- Stuur richting een kennismaking wanneer er een duidelijke commerciële kans is.

Commerciële conversatie:
- Wees behulpzaam, maar neem initiatief.
- Wanneer een bezoeker duidelijke interesse toont, probeer dan de volgende concrete stap te bereiken.
- Vraag relevante informatie uit wanneer die nodig is om een goed advies te geven.
- Vraag bijvoorbeeld naar bedrijfsnaam, type bedrijf, probleem, gewenste oplossing of huidige werkwijze.
- Wanneer iemand serieus geïnteresseerd is, vraag dan vrijwillig om een e-mailadres of telefoonnummer voor opvolging.
- Vraag nooit meerdere persoonlijke gegevens tegelijk als dat niet nodig is.
- Maak het de bezoeker makkelijk om te kiezen tussen bijvoorbeeld e-mail, telefoon of een kennismaking.
- Dring niet aan en blijf professioneel.
- Verzin nooit contactgegevens.
- Verzin nooit afspraken of beschikbare tijdstippen.

Belangrijk:
- Doe niet alsof functies al live bij de bezoeker zijn geïntegreerd.
- Zeg dat afspraken, CRM-koppelingen, e-mailflows en andere acties worden ingericht wanneer dat onderdeel is van de gekozen oplossing.
- Verzin geen klantcases, resultaten, prijzen of integraties die niet in de website-informatie staan.
- Geef geen technisch lange uitleg tenzij de bezoeker daar expliciet om vraagt.
- Antwoord in natuurlijk Nederlands, helder en praktisch.
- Houd antwoorden compact: meestal 80-180 woorden.

AIVaultsAI biedt momenteel:
1. Websites op maat, mobiel-first, SEO-ready en conversiegericht.
2. AI-assistenten voor vragen, bedrijfskennis, leadopvang, leadkwalificatie en — wanneer ingericht — afspraken.
3. AI lead & automation voor opvolging, formulieren, e-mail, documenten en koppelingen met bestaande tools.

Startprijzen op de website zijn vanaf €495 voor Web, vanaf €795 voor Website + AI-assistent (+ €49/mnd vanaf), en vanaf €995 voor AI Lead & Automation. Prijzen zijn vanafprijzen en exclusief btw; externe software/API-kosten kunnen van toepassing zijn.

Als iemand vraagt om direct een afspraak te maken, verwijs dan naar de CTA op de pagina voor een kennismaking. Maak geen afspraak en claim geen agenda-integratie tenzij die daadwerkelijk is aangesloten.`;

/**
 * Rate limiter: per-IP and per-session sliding window.
 * Tuned via ASSISTANT_RATE_LIMIT (default 20) per ASSISTANT_RATE_WINDOW_MS
 * (default 60_000). In-memory, per server process.
 */
const rateLimiter = new RateLimiter({
  limit: readPositiveInt(process.env.ASSISTANT_RATE_LIMIT, 20),
  windowMs: readPositiveInt(process.env.ASSISTANT_RATE_WINDOW_MS, 60_000),
});

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function extractText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const response = data as {
    output_text?: unknown;
    output?: unknown;
  };

  if (typeof response.output_text === "string") {
    return response.output_text.trim();
  }

  if (!Array.isArray(response.output)) {
    return "";
  }

  return response.output
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const content = (item as { content?: unknown }).content;

      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((part) => {
        if (!part || typeof part !== "object") {
          return [];
        }

        const text = (part as { text?: unknown }).text;

        return typeof text === "string" ? [text] : [];
      });
    })
    .join("\n")
    .trim();
}

function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return postgres(databaseUrl, {
    max: 5,
    prepare: false,
  });
}

async function createConversation(
  sql: ReturnType<typeof postgres>,
  sessionId: string,
  attribution: Attribution = {},
): Promise<string> {
  const created = await sql`
    INSERT INTO conversations (
      source,
      visitor_session_id,
      metadata
    )
    VALUES (
      'ai_assistant',
      ${sessionId},
      ${sql.json(attribution)}::jsonb
    )
    RETURNING conversation_id
  `;
  return created[0].conversation_id;
}

export async function POST(request: Request) {
  /*
   * ----------------------------------------------------------
   * 0. Optional shared-secret gate (opt-in).
   *
   * When ASSISTANT_API_KEY is configured, every request must present
   * the key as `Authorization: Bearer <key>`. When it is not
   * configured, the endpoint remains the anonymous public demo —
   * see report: authentication depends on missing auth infrastructure.
   * ----------------------------------------------------------
   */
  const expectedApiKey = process.env.ASSISTANT_API_KEY;
  if (expectedApiKey) {
    const presented = readBearerToken(request);
    if (!verifyAssistantApiKey(presented, expectedApiKey)) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
        },
        {
          status: 401,
        },
      );
    }
  }

  /*
   * ----------------------------------------------------------
   * 1. Abuse protection: per-IP rate limit before body parsing.
   * ----------------------------------------------------------
   */
  const ip = clientIp(request);
  const ipLimit = rateLimiter.check(`ip:${ip}`);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      {
        error: "Te veel verzoeken. Probeer het later opnieuw.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
      },
    );
  }

  /*
   * ----------------------------------------------------------
   * 2. Body size cap, then JSON parse, then validation.
   * ----------------------------------------------------------
   */
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Ongeldige aanvraag." },
      { status: 400 },
    );
  }

  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Aanvraag is te groot." },
      { status: 413 },
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Ongeldige JSON." },
      { status: 400 },
    );
  }

  const parsed = parseAssistantRequest(data);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { conversationId, sessionId, message } = parsed.value;

  /*
   * Organic attribution (first-touch) — captured only when a conversation
   * is created. Client input is fully untrusted and sanitized server-side;
   * malformed attribution can never fail the request.
   */
  const rawBody = data as Record<string, unknown>;
  const attribution = parseClientAttribution(rawBody["attribution"]);

  /*
   * ----------------------------------------------------------
   * 3. Per-session rate limit.
   * ----------------------------------------------------------
   */
  const sessionLimit = rateLimiter.check(`session:${sessionId}`);
  if (!sessionLimit.allowed) {
    return NextResponse.json(
      {
        error: "Te veel verzoeken. Probeer het later opnieuw.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(sessionLimit.retryAfterSeconds) },
      },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "De AI-assistent is nog niet geconfigureerd.",
      },
      {
        status: 503,
      },
    );
  }

  let sql: ReturnType<typeof postgres> | null = null;

  try {
    sql = getDatabase();

    /*
     * ----------------------------------------------------------
     * 4. Resolve or create conversation — ownership enforced.
     *
     * A conversation may only be resumed when BOTH the
     * conversation_id AND the visitor_session_id match. Anything
     * else starts a fresh conversation bound to this session, so a
     * caller can never attach to another session's conversation.
     * ----------------------------------------------------------
     */
    let resolvedConversationId: string;
    if (isValidUuid(conversationId)) {
      const owned = await sql`
        SELECT conversation_id
        FROM conversations
        WHERE conversation_id = ${conversationId}::uuid
          AND visitor_session_id = ${sessionId}
        LIMIT 1
      `;

      resolvedConversationId =
        owned.length > 0
          ? owned[0].conversation_id
          : await createConversation(sql, sessionId, attribution);
    } else {
      resolvedConversationId = await createConversation(sql, sessionId, attribution);
    }

    /*
     * ----------------------------------------------------------
     * 5. Authoritative history from the database.
     *
     * Client-supplied history is never trusted. The model context is
     * rebuilt from conversation_messages ordered by sequence_number.
     * ----------------------------------------------------------
     */
    const historyRows = await sql`
      SELECT role, content
      FROM conversation_messages
      WHERE conversation_id = ${resolvedConversationId}::uuid
      ORDER BY sequence_number DESC
      LIMIT ${MAX_HISTORY_MESSAGES}
    `;
    historyRows.reverse();
    const history = normalizeHistory(historyRows);

    /*
     * ----------------------------------------------------------
     * 6. Persist the visitor message and record start event.
     * ----------------------------------------------------------
     */

    const sequenceResult = await sql`
      SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence
      FROM conversation_messages
      WHERE conversation_id = ${resolvedConversationId}::uuid
    `;

    const nextSequence = Number(sequenceResult[0].next_sequence);

    const insertedMessage = await sql`
      INSERT INTO conversation_messages (
        conversation_id,
        role,
        content,
        sequence_number
      )
      VALUES (
        ${resolvedConversationId}::uuid,
        'user',
        ${message},
        ${nextSequence}
      )
      RETURNING message_id
    `;
    const userMessageId = insertedMessage[0]?.message_id ?? null;

    if (nextSequence === 1) {
      await sql`
        INSERT INTO lead_events (
          conversation_id,
          message_id,
          event_type,
          source,
          origin,
          metadata
        )
        VALUES (
          ${resolvedConversationId}::uuid,
          ${userMessageId}::uuid,
          'assistant_conversation_started',
          'ai_assistant',
          'live_assistant',
          ${sql.json({
            conversationId: resolvedConversationId,
          })}::jsonb
        )
      `;
    }

    await sql`
      UPDATE conversations
      SET
        last_activity_at = NOW()
      WHERE conversation_id = ${resolvedConversationId}::uuid
    `;

    /*
     * ----------------------------------------------------------
     * 7. Ask OpenAI with bounded context and a hard timeout.
     * ----------------------------------------------------------
     */

    const modelInput = buildModelInput(history, message);

    let upstream: Response;
    try {
      upstream = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model:
              process.env.OPENAI_ASSISTANT_MODEL ||
              "gpt-5.6-luna",
            instructions: SYSTEM_PROMPT,
            input: modelInput,
            max_output_tokens: MAX_OUTPUT_TOKENS,
          }),
          signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
        },
      );
    } catch (error) {
      const name = error instanceof Error ? error.name : "unknown";
      const timedOut = name === "TimeoutError";
      console.error(
        "assistant: OpenAI request failed",
        timedOut ? "timeout" : name,
      );
      return NextResponse.json(
        {
          error: timedOut
            ? "De AI-assistent reageert niet op tijd. Probeer het opnieuw."
            : "De AI-assistent is tijdelijk niet bereikbaar. Probeer het opnieuw.",
        },
        {
          status: timedOut ? 504 : 502,
        },
      );
    }

    if (!upstream.ok) {
      console.error(
        "assistant: OpenAI upstream error",
        upstream.status,
      );
      return NextResponse.json(
        {
          error:
            "De AI-assistent is tijdelijk niet beschikbaar. Probeer het zo opnieuw.",
          conversationId: resolvedConversationId,
        },
        {
          status: 502,
        },
      );
    }

    const data = (await upstream.json()) as unknown;

    const assistantMessage = extractText(data);

    if (!assistantMessage) {
      return NextResponse.json(
        {
          error:
            "De assistent gaf geen antwoord terug. Probeer het opnieuw.",
          conversationId: resolvedConversationId,
        },
        {
          status: 502,
        },
      );
    }

    /*
     * ----------------------------------------------------------
     * 8. Persist AI response.
     * ----------------------------------------------------------
     */

    const assistantSequence = nextSequence + 1;

    await sql`
      INSERT INTO conversation_messages (
        conversation_id,
        role,
        content,
        sequence_number
      )
      VALUES (
        ${resolvedConversationId}::uuid,
        'assistant',
        ${assistantMessage},
        ${assistantSequence}
      )
    `;

    await sql`
      UPDATE conversations
      SET
        last_activity_at = NOW()
      WHERE conversation_id = ${resolvedConversationId}::uuid
    `;

    /*
     * ----------------------------------------------------------
     * 8b. Customer-zero funnel wiring (non-fatal).
     *
     * Connects the existing conversation to the existing
     * customer-zero orchestrator: commercial intent detection,
     * lead creation and qualification events. A conversation gets
     * at most one lead; failures never break the assistant reply.
     * ----------------------------------------------------------
     */
    await maybeRunCustomerZeroOrchestration(
      {
        conversationId: resolvedConversationId,
        messages: [...history, { role: "user", content: message }],
        messageId: userMessageId ?? undefined,
      },
      createDefaultFunnelDeps(),
    );

    return NextResponse.json({
      message: assistantMessage,
      conversationId: resolvedConversationId,
    });
  } catch (error) {
    console.error(
      "assistant: route error",
      error instanceof Error ? error.name : "unknown",
    );

    return NextResponse.json(
      {
        error:
          "Er ging iets mis met de AI-assistent. Probeer het opnieuw.",
      },
      {
        status: 500,
      },
    );
  } finally {
    if (sql) {
      await sql.end();
    }
  }
}
