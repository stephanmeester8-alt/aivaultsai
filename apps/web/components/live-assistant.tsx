"use client";

import { useState, type FormEvent } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type AssistantResponse = {
  message?: string;
  conversationId?: string;
  error?: string;
};

const QUICK_PROMPTS = [
  "Wat kan een AI-assistent voor mijn bedrijf doen?",
  "Ik wil meer leads via mijn website.",
  "Welke automatisering zou bij mijn bedrijf passen?",
  "Kan AI afspraken voor mijn klanten maken?",
];

const WELCOME: Message = {
  role: "assistant",
  content:
    "Hoi! Ik ben de AIVaultsAI-assistent. Probeer me gerust uit. Vertel wat voor bedrijf je hebt, wat je wilt verbeteren of waar je nu tijd aan verliest. Ik laat je zien hoe we AI, leads en automatisering kunnen inzetten.",
};

export function LiveAssistant() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /*
   * The conversation ID is created by the backend on the
   * first visitor message.
   *
   * It is kept in React state for the lifetime of this
   * assistant session.
   */
  const [conversationId, setConversationId] = useState<string | null>(null);

  /*
   * Anonymous session identity used by the server to bind conversation
   * ownership. Generated once per browser and persisted in localStorage.
   */
  const [sessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const KEY = "aivaultsai_session_id";
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(KEY, created);
    return created;
  });

  async function sendMessage(value: string) {
    const text = value.trim();

    if (!text || loading) {
      return;
    }

    const nextMessages: Message[] = [
      ...messages,
      {
        role: "user",
        content: text,
      },
    ];

    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const requestBody = {
        sessionId,
        message: text,
        ...(conversationId ? { conversationId } : {}),
      };

      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = (await response.json()) as AssistantResponse;

      if (!response.ok || !data.message) {
        throw new Error(
          data.error || "De assistent kon nu geen antwoord geven.",
        );
      }

      /*
       * The backend creates the conversation on the first
       * message and returns its ID.
       *
       * On later messages the same ID is sent back to the API,
       * allowing PostgreSQL to keep the complete conversation
       * together.
       */
      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.message as string,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Er ging iets mis. Probeer het opnieuw.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <section
      id="live-ai"
      className="scroll-mt-24 border-b border-line py-16 sm:py-24"
      aria-labelledby="live-ai-heading"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          {/* Introductie */}
          <div>
            <div className="flex items-center gap-3">
              <span
                className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]"
                aria-hidden="true"
              />

              <p className="font-mono text-[10px] tracking-[0.18em] text-gold uppercase">
                Live AI demo · online
              </p>
            </div>

            <h2
              id="live-ai-heading"
              className="mt-4 text-3xl font-medium tracking-tight text-ink sm:text-4xl"
            >
              Praat met de AI die wij voor bedrijven bouwen.
            </h2>

            <p className="mt-5 text-base leading-relaxed text-mute sm:text-lg">
              Geen video. Geen verkooppraatje. Probeer het gewoon. Geef de
              assistent een bedrijf, probleem of doel en ontdek direct welke
              AI-oplossing daarbij past.
            </p>

            <div className="mt-7 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {[
                ["01", "Leads", "Aanvragen opvangen en kwalificeren"],
                [
                  "02",
                  "Afspraken",
                  "Klanten begeleiden naar een afspraak",
                ],
                [
                  "03",
                  "Automatisering",
                  "Terugkerend werk slimmer maken",
                ],
              ].map(([number, title, detail]) => (
                <div
                  key={number}
                  className="border border-line bg-panel p-4"
                >
                  <div className="flex gap-3">
                    <span className="font-mono text-[10px] text-gold">
                      {number}
                    </span>

                    <div>
                      <p className="text-sm font-medium text-ink">{title}</p>

                      <p className="mt-1 text-xs leading-relaxed text-mute">
                        {detail}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chatbot */}
          <div className="min-w-0 overflow-hidden border border-line bg-panel shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  AIVaultsAI Assistant
                </p>

                <p className="mt-0.5 text-[10px] text-faint">
                  AI · business · automation
                </p>
              </div>

              <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-emerald-300 uppercase">
                Live demo
              </span>
            </div>

            {/* Chat messages */}
            <div
              className="h-[390px] overflow-y-auto p-4 sm:h-[430px] sm:p-5"
              aria-live="polite"
            >
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${
                      message.role === "user"
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-sm border px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] ${
                        message.role === "user"
                          ? "border-gold/30 bg-gold/10 text-ink"
                          : "border-line bg-canvas text-mute"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}

                {loading ? (
                  <div className="flex justify-start">
                    <div className="border border-line bg-canvas px-4 py-3 text-sm text-mute">
                      <span
                        className="inline-flex items-center gap-1"
                        aria-label="AI denkt na"
                      >
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold [animation-delay:300ms]" />
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Input area */}
            <div className="border-t border-line p-3 sm:p-4">
              {/* Quick prompts */}
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    disabled={loading}
                    className="shrink-0 rounded-full border border-line px-3 py-2 text-left text-[11px] text-mute transition hover:border-gold/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Error */}
              {error ? (
                <p className="mb-3 text-xs leading-relaxed text-red-300">
                  {error}
                </p>
              ) : null}

              {/* Message form */}
              <form
                onSubmit={handleSubmit}
                className="flex min-w-0 gap-2"
              >
                <label
                  htmlFor="assistant-message"
                  className="sr-only"
                >
                  Typ je vraag
                </label>

                <input
                  id="assistant-message"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Vertel wat voor bedrijf je hebt..."
                  maxLength={1000}
                  disabled={loading}
                  className="min-w-0 flex-1 rounded-sm border border-line bg-canvas px-3 py-3 text-sm text-ink outline-none placeholder:text-faint focus:border-gold/60 disabled:opacity-60"
                />

                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="shrink-0 rounded-sm bg-ink px-4 py-3 text-sm font-medium text-canvas transition hover:bg-gold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Stuur
                </button>
              </form>

              {/* Footer */}
              <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[10px] leading-relaxed text-faint">
                  Demo-assistent. Deel geen wachtwoorden of gevoelige
                  informatie.
                </p>

                <a
                  href="#contact"
                  className="shrink-0 text-xs font-medium text-gold underline decoration-gold/30 underline-offset-4 hover:decoration-gold"
                >
                  Dit voor mijn bedrijf →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
