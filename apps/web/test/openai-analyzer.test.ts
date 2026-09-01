import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProspectAnalyzer,
  extractResponsesText,
  parseIntelligenceResponse,
  type OpenAiAnalyzerOptions,
} from "../lib/prospect-run/openai-analyzer.ts";

const BASE_INPUT = {
  companyName: "Example BV",
  websiteUrl: "https://example.com",
  knownPainPoints: ["SaaS seat-cost creep"],
  publicSignals: ["pricing page", "engineering blog"],
};

type FakeResponse = { ok: boolean; status: number; body: unknown };

function responsesPayload(text: string): unknown {
  return {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text }],
      },
    ],
  };
}

function okResponse(body: unknown): FakeResponse {
  return { ok: true, status: 200, body };
}

function validJson(): string {
  return JSON.stringify({
    pains: ["SaaS seat-cost creep", "manual qualification"],
    evidence: ["pricing page", "GDPR audit mentioned"],
    unknowns: ["CRM conversion data"],
    commercialOpportunity: 92,
    evidenceBaseline: 71,
    uncertainty: 18,
  });
}

function makeFakeFetch(handler: (url: string, init: RequestInit) => Promise<FakeResponse>) {
  const calls: Array<{ url: string; init: RequestInit; body: unknown }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = String(url);
    calls.push({ url: urlString, init: init ?? {}, body: init?.body ? JSON.parse(String(init.body)) : null });
    const result = await handler(urlString, init ?? {});
    return {
      ok: result.ok,
      status: result.status,
      json: async () => result.body,
    } as Response;
  };
  return { fetchImpl, calls };
}

function analyzerWith(
  options: Partial<OpenAiAnalyzerOptions> & {
    handler: (url: string, init: RequestInit) => Promise<FakeResponse>;
  },
) {
  const { handler, ...rest } = options;
  const { fetchImpl, calls } = makeFakeFetch(handler);
  return { analyzer: createProspectAnalyzer({ ...rest, fetchImpl }), calls };
}

test("no API key: deterministic fallback, fetch is never called", async () => {
  let called = false;
  const { analyzer } = analyzerWith({
    handler: async () => {
      called = true;
      return okResponse(responsesPayload(validJson()));
    },
  });
  const intelligence = await analyzer(BASE_INPUT);
  assert.equal(called, false);
  assert.equal(intelligence.pains.length, 1);
  assert.equal(intelligence.unknowns.length > 0, true);
});

test("valid Responses API payload is parsed and bounded", async () => {
  const { analyzer, calls } = analyzerWith({
    apiKey: "test-key",
    handler: async () => okResponse(responsesPayload(validJson())),
  });
  const intelligence = await analyzer(BASE_INPUT);
  assert.equal(calls.length, 1);
  assert.equal(intelligence.pains[0], "SaaS seat-cost creep");
  assert.equal(intelligence.commercialOpportunity, 92);
  assert.equal(intelligence.evidenceBaseline, 71);
  assert.equal(intelligence.uncertainty, 18);
});

test("request uses the Responses API contract and the configured model", async () => {
  const { analyzer, calls } = analyzerWith({
    apiKey: "test-key",
    model: "gpt-test",
    endpoint: "https://example.test/v1/responses",
    handler: async () => okResponse(responsesPayload(validJson())),
  });
  await analyzer(BASE_INPUT);
  const call = calls[0]!;
  assert.equal(call.url, "https://example.test/v1/responses");
  assert.equal(
    (call.init.headers as Record<string, string> | undefined)?.["Authorization"],
    "Bearer test-key",
  );
  const body = call.body as {
    model?: string;
    text?: { format?: { type?: string; strict?: boolean } };
  };
  assert.equal(body.model, "gpt-test");
  assert.equal(body.text?.format?.type, "json_schema");
  assert.equal(body.text?.format?.strict, true);
});

test("PII is redacted from every string sent to the model", async () => {
  let sentBody: unknown = null;
  const { analyzer } = analyzerWith({
    apiKey: "test-key",
    handler: async (_url, init) => {
      sentBody = JSON.parse(String(init.body));
      return okResponse(responsesPayload(validJson()));
    },
  });
  await analyzer({
    ...BASE_INPUT,
    knownPainPoints: ["contact jan@example.com for pricing", "call +31 6 12345678"],
    publicSignals: ["press release mentioning anna@example.org", "phone +31 20 123 4567"],
    crmSignals: ["renewal contact peter@example.com"],
  });
  const input = String((sentBody as { input?: unknown }).input ?? "");
  assert.equal(input.includes("jan@example.com"), false);
  assert.equal(input.includes("anna@example.org"), false);
  assert.equal(input.includes("peter@example.com"), false);
  assert.equal(input.includes("+31"), false);
  assert.match(input, /\[redacted-email\]/);
  assert.match(input, /\[redacted-phone\]/);
});

test("HTTP error status falls back to the deterministic baseline", async () => {
  const { analyzer } = analyzerWith({
    apiKey: "test-key",
    handler: async () => ({ ok: false, status: 500, body: { error: "upstream" } }),
  });
  const intelligence = await analyzer(BASE_INPUT);
  assert.equal(intelligence.pains[0], "SaaS seat-cost creep");
});

test("unparseable model output falls back and never throws", async () => {
  const { analyzer } = analyzerWith({
    apiKey: "test-key",
    handler: async () => okResponse(responsesPayload("definitely not json")),
  });
  const intelligence = await analyzer(BASE_INPUT);
  assert.equal(intelligence.pains[0], "SaaS seat-cost creep");
});

test("out-of-bounds score components are clamped to 0-100", async () => {
  const { analyzer } = analyzerWith({
    apiKey: "test-key",
    handler: async () =>
      okResponse(
        responsesPayload(
          JSON.stringify({
            pains: ["p1"], evidence: ["e1"], unknowns: [],
            commercialOpportunity: 999, evidenceBaseline: -5, uncertainty: 120.6,
          }),
        ),
      ),
  });
  const intelligence = await analyzer(BASE_INPUT);
  assert.equal(intelligence.commercialOpportunity, 100);
  assert.equal(intelligence.evidenceBaseline, 0);
  assert.equal(intelligence.uncertainty, 100);
});

test("response without pains or evidence is rejected (fallback)", async () => {
  const { analyzer } = analyzerWith({
    apiKey: "test-key",
    handler: async () =>
      okResponse(
        responsesPayload(
          JSON.stringify({
            pains: [], evidence: [], unknowns: ["everything"],
            commercialOpportunity: 90, evidenceBaseline: 80, uncertainty: 10,
          }),
        ),
      ),
  });
  const intelligence = await analyzer(BASE_INPUT);
  assert.equal(intelligence.pains[0], "SaaS seat-cost creep");
});

test("fetch abort (timeout) falls back and never throws", async () => {
  const { analyzer } = analyzerWith({
    apiKey: "test-key",
    timeoutMs: 5,
    handler: (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("AbortError")));
      }),
  });
  const intelligence = await analyzer(BASE_INPUT);
  assert.equal(intelligence.pains[0], "SaaS seat-cost creep");
});

test("parser extracts output_text and rejects garbage", () => {
  assert.equal(extractResponsesText(responsesPayload(validJson())), validJson());
  assert.equal(extractResponsesText({ output: [] }), null);
  assert.equal(extractResponsesText(null), null);
  const parsed = parseIntelligenceResponse(responsesPayload(validJson()));
  assert.ok(parsed);
  assert.equal(parsed.commercialOpportunity, 92);
  assert.equal(parseIntelligenceResponse({ output: [] }), null);
  assert.equal(
    parseIntelligenceResponse({
      output: [{ type: "message", content: [{ type: "output_text", text: "nope" }] }],
    }),
    null,
  );
});

test("model receives sanitized signals only (no raw CRM strings)", async () => {
  let sentBody: unknown = null;
  const { analyzer } = analyzerWith({
    apiKey: "test-key",
    handler: async (_url, init) => {
      sentBody = JSON.parse(String(init.body));
      return okResponse(responsesPayload(validJson()));
    },
  });
  await analyzer({
    ...BASE_INPUT,
    crmSignals: ["decision maker direct line +31 6 111 22 33", "renewal owner mary@example.nl"],
  });
  const input = String((sentBody as { input?: unknown }).input ?? "");
  assert.equal(input.includes("mary@example.nl"), false);
  assert.equal(input.includes("111 22 33"), false);
});
