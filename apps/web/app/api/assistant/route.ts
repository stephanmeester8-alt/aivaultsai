import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `Je bent de commerciële AIVaultsAI-assistent op de publieke website.

Doel:
- Laat bezoekers ervaren hoe een zakelijke AI-assistent werkt.
- Leg concreet uit wat AIVaultsAI kan bouwen: websites, AI-assistenten, leadopvang, leadkwalificatie, afsprakenflows en procesautomatisering.
- Denk mee vanuit het bedrijf van de bezoeker en geef maximaal 3 concrete ideeën.
- Stel maximaal 2 gerichte vervolgvragen als die nodig zijn.
- Stuur richting een kennismaking wanneer er een duidelijke commerciële kans is.

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

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

function extractText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const response = data as { output_text?: unknown; output?: unknown };

  if (typeof response.output_text === "string") return response.output_text.trim();
  if (!Array.isArray(response.output)) return "";

  return response.output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? [text] : [];
      });
    })
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "De AI-assistent is nog niet geconfigureerd." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { messages?: unknown };
    const messages = Array.isArray(body.messages) ? body.messages.filter(isMessage).slice(-10) : [];

    if (messages.length === 0) {
      return NextResponse.json({ error: "Stuur eerst een bericht." }, { status: 400 });
    }

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ASSISTANT_MODEL || "gpt-5.6-luna",
        instructions: SYSTEM_PROMPT,
        input: messages,
        max_output_tokens: 500,
      }),
    });

    if (!upstream.ok) {
      console.error("OpenAI assistant request failed", upstream.status, await upstream.text());
      return NextResponse.json({ error: "De AI-assistent is tijdelijk niet beschikbaar. Probeer het zo opnieuw." }, { status: 502 });
    }

    const data = (await upstream.json()) as unknown;
    const message = extractText(data);

    if (!message) {
      return NextResponse.json({ error: "De assistent gaf geen antwoord terug. Probeer het opnieuw." }, { status: 502 });
    }

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Assistant route error", error);
    return NextResponse.json({ error: "Er ging iets mis met de AI-assistent. Probeer het opnieuw." }, { status: 500 });
  }
}
