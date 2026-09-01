import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ASSISTANT_TOOLS,
  MAX_ASSISTANT_TOOL_ROUNDS,
  buildToolContinuationInput,
  extractText,
  extractToolCalls,
  runAssistantToolLoop,
  type AssistantToolExecution,
} from "../lib/assistant/tool-loop.ts";

function textResponse(text: string): unknown {
  return {
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
  };
}

function toolResponse(callId: string, args: unknown): unknown {
  return {
    output: [
      {
        type: "function_call",
        call_id: callId,
        name: "assistant_website_research",
        arguments: JSON.stringify(args),
      },
    ],
  };
}

const HISTORY = [{ role: "user" as const, content: "Eerder bericht" }];
const MESSAGE = "Onderzoek deze website: https://example.com";

function okResult(output: unknown): AssistantToolExecution {
  return { ok: true, output, error: null, executionStatus: "SUCCEEDED", evidenceIds: ["ev-1"] };
}

function failResult(error: string): AssistantToolExecution {
  return { ok: false, output: null, error, executionStatus: "FAILED", evidenceIds: [] };
}

test("the assistant tool definition is the only exposed function", () => {
  assert.equal(ASSISTANT_TOOLS.length, 1);
  assert.equal(ASSISTANT_TOOLS[0]!.name, "assistant_website_research");
  assert.equal(ASSISTANT_TOOLS[0]!.type, "function");
  assert.deepEqual(
    (ASSISTANT_TOOLS[0]!.parameters as { required?: string[] }).required,
    ["url"],
  );
  assert.equal(MAX_ASSISTANT_TOOL_ROUNDS, 2);
});

test("extractToolCalls parses function_call items and ignores messages", () => {
  const calls = extractToolCalls({
    output: [
      { type: "message", content: [{ type: "output_text", text: "hallo" }] },
      { type: "function_call", call_id: "call-1", name: "assistant_website_research", arguments: '{"url":"https://x.nl"}' },
      { type: "function_call", call_id: "call-2", name: "assistant_website_research" },
    ],
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.callId, "call-1");
  assert.equal(calls[0]!.arguments, '{"url":"https://x.nl"}');
  // Missing/weird arguments degrade to "{}".
  assert.equal(calls[1]!.arguments, "{}");
  assert.deepEqual(extractToolCalls(null), []);
  assert.deepEqual(extractToolCalls({ output: [] }), []);
});

test("extractText reads output_text and message content parts", () => {
  assert.equal(extractText({ output_text: "  antwoord " }), "antwoord");
  assert.equal(extractText(textResponse("antwoord")), "antwoord");
  assert.equal(extractText({ output: [] }), "");
  assert.equal(extractText(null), "");
});

test("buildToolContinuationInput appends function_call and output items", () => {
  const input = buildToolContinuationInput(
    HISTORY,
    MESSAGE,
    { callId: "call-1", name: "assistant_website_research", arguments: "{}" },
    { status: 200, body: "<html>ok</html>" },
  );
  assert.equal(input.length, 4);
  assert.deepEqual(input[1], { role: "user", content: MESSAGE });
  assert.equal((input[2] as { type: string }).type, "function_call");
  assert.equal((input[3] as { type: string }).type, "function_call_output");
  assert.equal((input[3] as { call_id: string }).call_id, "call-1");
  assert.match(String((input[3] as { output: string }).output), /<html>ok<\/html>/);
});

test("text-only response: no tool round, original text returned", async () => {
  let executed = 0;
  const result = await runAssistantToolLoop({
    history: HISTORY,
    message: MESSAGE,
    firstResponse: textResponse("Gewoon een antwoord."),
    modelCall: async () => ({ ok: true as const, data: null }),
    executeTool: async () => {
      executed += 1;
      return okResult(null);
    },
  });
  assert.equal(result.text, "Gewoon een antwoord.");
  assert.equal(result.toolRounds, 0);
  assert.equal(executed, 0);
});

test("tool call is executed once and its result reaches the model for the final answer", async () => {
  const seenInputs: unknown[][] = [];
  const result = await runAssistantToolLoop({
    history: HISTORY,
    message: MESSAGE,
    firstResponse: toolResponse("call-1", { url: "https://example.com" }),
    modelCall: async (input) => {
      seenInputs.push(input);
      return { ok: true as const, data: textResponse("Het bedrijf heeft een chatbot.") };
    },
    executeTool: async (call) => {
      assert.equal(call.callId, "call-1");
      assert.equal(call.name, "assistant_website_research");
      return okResult({ status: 200, ok: true, url: "https://example.com", body: "<html>chat widget</html>" });
    },
  });
  assert.equal(result.toolRounds, 1);
  assert.equal(result.text, "Het bedrijf heeft een chatbot.");
  assert.equal(result.toolResults.length, 1);
  assert.equal(seenInputs.length, 1);
  const continuation = seenInputs[0]!;
  assert.ok(continuation.some((item) => (item as { type?: string }).type === "function_call_output"));
});

test("tool failure is fed back to the model as a structured error", async () => {
  const result = await runAssistantToolLoop({
    history: HISTORY,
    message: MESSAGE,
    firstResponse: toolResponse("call-1", { url: "https://example.com" }),
    modelCall: async (input) => {
      const output = input.find((item) => (item as { type?: string }).type === "function_call_output") as
        | { output?: string }
        | undefined;
      assert.match(output?.output ?? "", /BLOCKED/);
      return { ok: true as const, data: textResponse("Ik kon die website niet bereiken.") };
    },
    executeTool: async () => failResult("PRIVATE_ADDRESS_BLOCKED"),
  });
  assert.equal(result.text, "Ik kon die website niet bereiken.");
  assert.equal(result.toolResults[0]!.result.error, "PRIVATE_ADDRESS_BLOCKED");
});

test("round limit is enforced: no infinite loop, safe fallback text", async () => {
  let executed = 0;
  const result = await runAssistantToolLoop({
    history: HISTORY,
    message: MESSAGE,
    firstResponse: toolResponse("call-1", { url: "https://a.nl" }),
    maxRounds: 1,
    modelCall: async () => ({ ok: true as const, data: toolResponse("call-2", { url: "https://b.nl" }) }),
    executeTool: async () => {
      executed += 1;
      return okResult({ status: 200, body: "x" });
    },
  });
  assert.equal(executed, 1); // only one round allowed
  assert.equal(result.toolRounds, 1);
  assert.match(result.text, /kon de website niet/);
});

test("model call failure in a later round falls back safely", async () => {
  const result = await runAssistantToolLoop({
    history: HISTORY,
    message: MESSAGE,
    firstResponse: toolResponse("call-1", { url: "https://a.nl" }),
    modelCall: async () => ({ ok: false as const, status: 504, error: "timeout" }),
    executeTool: async () => okResult({ status: 200, body: "x" }),
    fallbackText: "Fallback na timeout.",
  });
  assert.equal(result.text, "Fallback na timeout.");
  assert.equal(result.toolRounds, 1);
});

test("tool loop logs safe debug markers without secrets", async () => {
  const logs: string[] = [];
  await runAssistantToolLoop({
    history: HISTORY,
    message: MESSAGE,
    firstResponse: toolResponse("call-1", { url: "https://a.nl" }),
    modelCall: async () => ({ ok: true as const, data: textResponse("Klaar.") }),
    executeTool: async () => okResult({ status: 200, body: "x" }),
    log: (message) => logs.push(message),
  });
  assert.ok(logs.some((l) => l.includes("assistant_tool_requested name=assistant_website_research")));
  assert.ok(logs.some((l) => l.includes("tool_execution_result")));
  assert.ok(logs.some((l) => l.includes("tool_loop_finished rounds=1")));
  // No raw credentials/keys may ever appear in logs.
  assert.ok(logs.every((l) => !/sk-[A-Za-z0-9]|Bearer |authorization/i.test(l)));
});
