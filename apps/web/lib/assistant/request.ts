/**
 * Pure request validation and model-input building for the assistant API.
 *
 * No Next.js, no database, no network — fully unit-testable.
 */

export const MAX_MESSAGE_CHARS = 2000;
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_HISTORY_MESSAGES = 10;
export const MAX_OUTPUT_TOKENS = 500;
export const OPENAI_TIMEOUT_MS = 30_000;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantRequest = {
  conversationId?: string;
  sessionId: string;
  message: string;
};

export type ParseResult =
  | { ok: true; value: AssistantRequest }
  | { ok: false; status: number; error: string };

export function isValidUuid(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Validate and type the assistant request body.
 * The client may only supply the new user message; conversation history is
 * never accepted from the client (see normalizeHistory/buildModelInput).
 *
 * conversationId is optional. Both an omitted value and an explicit null
 * mean that the backend should create a new conversation. A supplied value
 * must still be a valid UUID.
 */
export function parseAssistantRequest(data: unknown): ParseResult {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, status: 400, error: "Ongeldige aanvraag." };
  }

  const body = data as Record<string, unknown>;
  const { conversationId, sessionId, message } = body;

  if (typeof message !== "string" || message.trim().length === 0) {
    return { ok: false, status: 400, error: "Stuur eerst een bericht." };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      status: 413,
      error: `Bericht is te lang (maximaal ${MAX_MESSAGE_CHARS} tekens).`,
    };
  }
  if (typeof sessionId !== "string" || !isValidUuid(sessionId)) {
    return { ok: false, status: 400, error: "Ongeldige sessie." };
  }
  if (conversationId !== undefined && conversationId !== null) {
    if (typeof conversationId !== "string" || !isValidUuid(conversationId)) {
      return { ok: false, status: 400, error: "Ongeldig gesprek." };
    }
  }

  return {
    ok: true,
    value: {
      conversationId:
        conversationId === null ? undefined : conversationId,
      sessionId,
      message: message.trim(),
    },
  };
}

/**
 * Map raw database rows to chat messages, keeping only rows the model input
 * may contain. System rows and malformed rows are dropped defensively.
 */
export function normalizeHistory(rows: readonly unknown[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { role, content } = row as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || content.trim().length === 0) continue;
    messages.push({ role, content });
  }
  return messages;
}

/**
 * Build the OpenAI model input from server-side history plus the single new
 * user message. History is authoritative (database), never client-supplied.
 */
export function buildModelInput(
  history: readonly ChatMessage[],
  message: string,
): ChatMessage[] {
  return [...history, { role: "user", content: message }];
}
