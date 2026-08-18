import { NextResponse } from "next/server";
import postgres from "postgres";

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

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AssistantRequestBody = {
  conversationId?: unknown;
  messages?: unknown;
};

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Record<string, unknown>;

  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

function isValidUuid(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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

export async function POST(request: Request) {
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
    const body = (await request.json()) as AssistantRequestBody;

    const messages = Array.isArray(body.messages)
      ? body.messages.filter(isMessage).slice(-10)
      : [];

    if (messages.length === 0) {
      return NextResponse.json(
        {
          error: "Stuur eerst een bericht.",
        },
        {
          status: 400,
        },
      );
    }

    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!latestUserMessage) {
      return NextResponse.json(
        {
          error: "Stuur eerst een bericht van de bezoeker.",
        },
        {
          status: 400,
        },
      );
    }

    sql = getDatabase();

    let conversationId: string;

    /*
     * ----------------------------------------------------------
     * 1. Resolve or create conversation
     * ----------------------------------------------------------
     */

    if (isValidUuid(body.conversationId)) {
      const existingConversation = await sql`
        SELECT conversation_id
        FROM conversations
        WHERE conversation_id = ${body.conversationId}::uuid
        LIMIT 1
      `;

      if (existingConversation.length > 0) {
        conversationId = existingConversation[0].conversation_id;
      } else {
        const createdConversation = await sql`
          INSERT INTO conversations (
            source
          )
          VALUES (
            'ai_assistant'
          )
          RETURNING conversation_id
        `;

        conversationId = createdConversation[0].conversation_id;
      }
    } else {
      const createdConversation = await sql`
        INSERT INTO conversations (
          source
        )
        VALUES (
          'ai_assistant'
        )
        RETURNING conversation_id
      `;

      conversationId = createdConversation[0].conversation_id;
    }

    /*
     * ----------------------------------------------------------
     * 2. Determine next message sequence number
     * ----------------------------------------------------------
     */

    const sequenceResult = await sql`
      SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence
      FROM conversation_messages
      WHERE conversation_id = ${conversationId}::uuid
    `;

    const nextSequence = Number(sequenceResult[0].next_sequence);

    /*
     * ----------------------------------------------------------
     * 3. Persist visitor message
     * ----------------------------------------------------------
     */

    await sql`
      INSERT INTO conversation_messages (
        conversation_id,
        role,
        content,
        sequence_number
      )
      VALUES (
        ${conversationId}::uuid,
        'user',
        ${latestUserMessage.content},
        ${nextSequence}
      )
    `;

    /*
     * ----------------------------------------------------------
     * 4. Record conversation-start event
     *
     * Only when this is the first persisted message.
     * ----------------------------------------------------------
     */

    if (nextSequence === 1) {
      await sql`
        INSERT INTO lead_events (
          conversation_id,
          event_type,
          source,
          origin,
          metadata
        )
        VALUES (
          ${conversationId}::uuid,
          'assistant_conversation_started',
          'ai_assistant',
          'live_assistant',
          ${JSON.stringify({
            conversationId,
          })}::jsonb
        )
      `;
    }

    /*
     * ----------------------------------------------------------
     * 5. Update conversation activity
     * ----------------------------------------------------------
     */

    await sql`
      UPDATE conversations
      SET
        last_activity_at = NOW()
      WHERE conversation_id = ${conversationId}::uuid
    `;

    /*
     * ----------------------------------------------------------
     * 6. Ask OpenAI
     * ----------------------------------------------------------
     */

    const upstream = await fetch(
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
          input: messages,
          max_output_tokens: 500,
        }),
      },
    );

    if (!upstream.ok) {
      console.error(
        "OpenAI assistant request failed",
        upstream.status,
        await upstream.text(),
      );

      return NextResponse.json(
        {
          error:
            "De AI-assistent is tijdelijk niet beschikbaar. Probeer het zo opnieuw.",
          conversationId,
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
          conversationId,
        },
        {
          status: 502,
        },
      );
    }

    /*
     * ----------------------------------------------------------
     * 7. Persist AI response
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
        ${conversationId}::uuid,
        'assistant',
        ${assistantMessage},
        ${assistantSequence}
      )
    `;

    /*
     * ----------------------------------------------------------
     * 8. Update conversation activity again
     * ----------------------------------------------------------
     */

    await sql`
      UPDATE conversations
      SET
        last_activity_at = NOW()
      WHERE conversation_id = ${conversationId}::uuid
    `;

    /*
     * ----------------------------------------------------------
     * 9. Return backwards-compatible response
     *
     * Existing frontend can continue using "message".
     * New frontend will also use conversationId.
     * ----------------------------------------------------------
     */

    return NextResponse.json({
      message: assistantMessage,
      conversationId,
    });
  } catch (error) {
    console.error("Assistant route error", error);

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