/**
 * Assistant tool-calling bridge (TASK: connect website assistant to runtime).
 *
 * Pure, testable tool-loop logic for the OpenAI Responses API:
 * - the model may request ONE bounded tool per round: assistant_website_research
 * - every call is executed by the EXISTING Agent Runtime bridge
 *   (runtime-adapter.executeAssistantToolCall -> PolicyEngine -> ExecutionGate
 *   -> HttpAdapter -> evidence)
 * - maximum 2 tool rounds; beyond that the loop stops safely with a fallback
 * - the model never performs HTTP itself and never decides permissions
 */

import type { AssistantToolExecution } from "../agent-runtime/runtime-adapter.ts";

export type { AssistantToolCall, AssistantToolExecution } from "../agent-runtime/runtime-adapter.ts";

export const MAX_ASSISTANT_TOOL_ROUNDS = 2;
export const FALLBACK_TOOL_TEXT =
  "Ik kon de website niet volledig onderzoeken. Probeer het later nog eens, of geef me een andere vraag.";

export interface AssistantToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** The only tool the website assistant may request. */
export const ASSISTANT_TOOLS: readonly AssistantToolDefinition[] = [
  {
    type: "function",
    name: "assistant_website_research",
    description:
      "Onderzoek een publieke website (read-only, met SSRF-bescherming). Gebruik dit om te zien wat een bedrijf doet, of een pagina bestaat, of een website een AI-chatbot of chatwidget heeft. Alleen openbare http(s)-pagina's; localhost, private en metadata-adressen worden geweigerd.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Volledige http(s)-URL van de te onderzoeken pagina.",
        },
      },
      required: ["url"],
    },
  },
];

export interface ParsedToolCall {
  callId: string;
  name: string;
  arguments: string;
}

/** Extract function_call items from an OpenAI Responses API payload. */
export function extractToolCalls(data: unknown): ParsedToolCall[] {
  if (!data || typeof data !== "object") return [];
  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return [];

  const calls: ParsedToolCall[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { type?: unknown; call_id?: unknown; name?: unknown; arguments?: unknown };
    if (candidate.type !== "function_call") continue;
    if (typeof candidate.call_id !== "string" || typeof candidate.name !== "string") continue;
    calls.push({
      callId: candidate.call_id,
      name: candidate.name,
      arguments: typeof candidate.arguments === "string" ? candidate.arguments : "{}",
    });
  }
  return calls;
}

export interface ChatInputItem {
  role: "user" | "assistant";
  content: string;
}

/**
 * Build the continuation input for the Responses API after a tool call:
 * the original conversation + the function_call item + its output.
 */
export function buildToolContinuationInput(
  history: readonly ChatInputItem[],
  message: string,
  call: ParsedToolCall,
  output: unknown,
): unknown[] {
  return [
    ...history,
    { role: "user", content: message },
    {
      type: "function_call",
      call_id: call.callId,
      name: call.name,
      arguments: call.arguments,
    },
    {
      type: "function_call_output",
      call_id: call.callId,
      output: JSON.stringify(output ?? {}),
    },
  ];
}

/** Extract the assistant text from a Responses API payload (shared with the route). */
export function extractText(data: unknown): string {
  if (!data || typeof data !== "object") return "";

  const response = data as { output_text?: unknown; output?: unknown };
  if (typeof response.output_text === "string") {
    return response.output_text.trim();
  }
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

export interface AssistantModelCall {
  (input: unknown[]): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }>;
}

export interface AssistantToolLoopOptions {
  history: readonly ChatInputItem[];
  message: string;
  firstResponse: unknown;
  modelCall: AssistantModelCall;
  executeTool: (call: ParsedToolCall) => Promise<AssistantToolExecution>;
  maxRounds?: number;
  fallbackText?: string;
  /** Safe debug logger (never log keys/credentials/headers). */
  log?: (message: string) => void;
}

export interface AssistantToolLoopResult {
  text: string;
  toolRounds: number;
  toolResults: Array<{ call: ParsedToolCall; result: AssistantToolExecution }>;
}

/**
 * Bounded tool loop. Round 1 = the first model response (already fetched by
 * the route). If it contains a function_call, the tool is executed through
 * the runtime bridge and the result is fed back for one more model call.
 * Maximum `maxRounds` executions; beyond that the loop stops with the last
 * text (or a safe fallback) — never an infinite loop.
 */
export async function runAssistantToolLoop(
  options: AssistantToolLoopOptions,
): Promise<AssistantToolLoopResult> {
  const maxRounds = Math.max(1, options.maxRounds ?? MAX_ASSISTANT_TOOL_ROUNDS);
  const fallbackText = options.fallbackText ?? FALLBACK_TOOL_TEXT;
  const log = options.log ?? ((message: string) => console.info(`[assistant-tool] ${message}`));
  const toolResults: AssistantToolLoopResult["toolResults"] = [];

  let responseData = options.firstResponse;
  let text = extractText(responseData);
  let toolRounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    const calls = extractToolCalls(responseData);
    if (calls.length === 0) break;
    toolRounds += 1;

    // One tool per round: bounded and predictable.
    const call = calls[0]!;
    log(`assistant_tool_requested name=${call.name} call_id=${call.callId} round=${toolRounds}`);
    const result = await options.executeTool(call);
    toolResults.push({ call, result });
    log(
      `tool_execution_result name=${call.name} ok=${result.ok} status=${result.executionStatus ?? "n/a"} error=${result.error ?? "none"}`,
    );

    const input = buildToolContinuationInput(
      options.history,
      options.message,
      call,
      result.ok ? result.output : { error: result.error },
    );
    const next = await options.modelCall(input);
    if (!next.ok) {
      log(`tool_loop_model_call_failed status=${next.status}`);
      text = fallbackText;
      break;
    }
    responseData = next.data;
    text = extractText(responseData);
  }

  // Safety net: if the final response still requests a tool (round limit
  // reached), stop and hand back a normal answer instead of looping again.
  if (extractToolCalls(responseData).length > 0) {
    text = text || fallbackText;
  }

  log(`tool_loop_finished rounds=${toolRounds} has_text=${text.length > 0}`);
  return { text, toolRounds, toolResults };
}
