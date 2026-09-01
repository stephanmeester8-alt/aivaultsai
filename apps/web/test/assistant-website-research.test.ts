import assert from "node:assert/strict";
import { test } from "node:test";

import * as core from "../../../packages/agent-core/src/index.ts";

import {
  executeAssistantToolCall,
  type AssistantToolCall,
  type AssistantToolCore,
} from "../lib/agent-runtime/runtime-adapter.ts";
import {
  buildResearchSummary,
  mergeResearchSummary,
  type ResearchSummary,
} from "../lib/assistant/research-summary.ts";

const PUBLIC_LOOKUP = async () => ["93.184.216.34"];

function toolCall(url: string): AssistantToolCall {
  return {
    callId: "call-1",
    name: "assistant_website_research",
    arguments: JSON.stringify({ url }),
  };
}

type PageRoute = { body: string; truncated?: boolean; url?: string };

function pageAdapter(routes: Record<string, PageRoute>) {
  return {
    id: "http-adapter",
    toolId: "http" as const,
    execute: async (request: {
      executionId: string;
      toolId: string;
      taskId: string | null;
      agentId: string;
      input?: { arguments?: { url?: string } };
    }) => {
      const requested = request.input?.arguments?.url ?? "";
      const route = routes[requested] ?? { body: "" };
      return {
        executionId: request.executionId,
        status: "SUCCEEDED" as const,
        toolId: request.toolId,
        taskId: request.taskId,
        agentId: String(request.agentId),
        output: {
          status: 200,
          ok: true,
          url: route.url ?? requested,
          body: route.body,
          truncated: route.truncated ?? false,
        },
        error: null,
        executionOccurred: true,
        startedAt: "2026-09-01T00:00:00.000Z",
        completedAt: "2026-09-01T00:00:00.000Z",
      };
    },
  };
}

function buildCore(adapter: { id: string; toolId: "http"; execute: (...args: never[]) => Promise<unknown> }): AssistantToolCore {
  const agents = core.createInitialAgentRegistry();
  const tasks = core.createTaskEngine(agents);
  const tools = core.createToolRegistry();
  tools.register({ ...core.HTTP_TOOL, enabled: true });
  const adapters = new core.ToolAdapterRegistry();
  adapters.register(adapter as never);
  const approvals = core.createApprovalEngine(agents, tasks);
  return {
    tasks,
    gate: core.createExecutionGate({ agents, tasks, tools, approvals, adapters }),
    evidence: core.createEvidenceStore(),
    recorder: { record: () => {} },
  } as unknown as AssistantToolCore;
}

const SMALL_PAGE = `<!DOCTYPE html><html><head><title>Acme BV</title>
<meta name="description" content="Acme levert kwaliteit."></head>
<body><h1>Acme BV</h1><h2>Diensten</h2>
<p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat. Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat. Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat.</p>
<a href="https://acme.nl/contact">Contact</a>
<a href="mailto:info@acme.nl">Mail ons</a>
<a href="tel:+31201234567">Bel ons</a>
<form><input type="email" name="e"></form>
</body></html>`;

// ---------------------------------------------------------------------------
// buildResearchSummary unit tests
// ---------------------------------------------------------------------------

test("summary extracts title, description, headings, links, contact and form", () => {
  const summary = buildResearchSummary(SMALL_PAGE, "https://acme.nl");
  assert.equal(summary.title, "Acme BV");
  assert.equal(summary.description, "Acme levert kwaliteit.");
  assert.deepEqual(summary.headings, ["Acme BV", "Diensten"]);
  assert.ok(summary.links.includes("https://acme.nl/contact"));
  assert.deepEqual(summary.contactSignals.mailto, ["info@acme.nl"]);
  assert.deepEqual(summary.contactSignals.tel, ["+31201234567"]);
  assert.equal(summary.hasForm, true);
  assert.equal(summary.visibleText.includes("<script"), false);
});

test("summary never contains raw HTML in the LLM-facing fields", () => {
  const html = `<html><head><script>const secret = "x".repeat(100000);</script></head>
  <body><h1>Titel</h1><p>Zichtbare tekst.</p></body></html>`;
  const summary = buildResearchSummary(html, "https://x.nl", { maxVisibleTextChars: 4000 });
  assert.ok(!summary.visibleText.includes("secret"));
  assert.ok(!summary.visibleText.includes("<script"));
  assert.ok(summary.visibleText.length <= 4000);
});

test("summary merges subpage detection evidence (YES wins, evidence kept)", () => {
  const home = buildResearchSummary("<html><body><p>kort</p></body></html>", "https://x.nl");
  const contact = buildResearchSummary(
    `<html><body><script src="https://widget.intercom.io/widget/abc"></script><p>contact</p></body></html>`,
    "https://x.nl/contact",
  );
  const merged = mergeResearchSummary(home, contact);
  assert.equal(merged.chatbotDetection?.status, "yes");
  assert.ok(merged.chatbotDetection?.detectedTechnologies.includes("Intercom"));
  assert.ok((merged.chatbotDetection?.evidence ?? []).length >= 1);
  assert.deepEqual(merged.pagesChecked, ["https://x.nl", "https://x.nl/contact"]);
});

// ---------------------------------------------------------------------------
// Bridge end-to-end tests (real ExecutionGate, fake HTTP adapter)
// ---------------------------------------------------------------------------

test("A: small HTML response is researched successfully", async () => {
  const strongPage = `<html><head><title>Acme BV</title></head><body><h1>Acme BV</h1>
  ${"<p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat.</p>".repeat(14)}
  </body></html>`;
  const core = buildCore(pageAdapter({ "https://acme.nl": { body: strongPage } }));
  const result = await executeAssistantToolCall(toolCall("https://acme.nl"), { core, lookup: PUBLIC_LOOKUP });
  assert.equal(result.ok, true);
  const summary = result.output as ResearchSummary;
  assert.equal(summary.title, "Acme BV");
  assert.equal(summary.pagesChecked.length, 1);
  assert.equal(summary.truncated, false);
  assert.ok(!JSON.stringify(summary).includes("<!DOCTYPE"));
});

test("B: large HTML response is bounded, not failed (truncated flag + limitations)", async () => {
  const big = "<html><body><h1>Groot bedrijf</h1><p>" + "y".repeat(500_000) + "</p></body></html>";
  const core = buildCore(
    pageAdapter({ "https://groot.nl": { body: big, truncated: true } }),
  );
  const result = await executeAssistantToolCall(toolCall("https://groot.nl"), { core, lookup: PUBLIC_LOOKUP });
  assert.equal(result.ok, true);
  const summary = result.output as ResearchSummary;
  assert.equal(summary.truncated, true);
  assert.ok(summary.limitations.includes("response_truncated"));
  // The raw 500KB payload never reaches the LLM-facing output.
  const json = JSON.stringify(summary);
  assert.ok(json.length < 20_000);
  assert.ok(!json.includes("y".repeat(10_000)));
  assert.ok(summary.visibleText.length <= 5000);
});

test("C: large scripts are not shipped into the LLM context", async () => {
  const html = `<html><head><script>${"z".repeat(50_000)}</script></head><body><h1>X</h1><p>tekst</p></body></html>`;
  const summary = buildResearchSummary(html, "https://x.nl");
  assert.ok(!summary.visibleText.includes("z".repeat(1000)));
});

test("D: large inline content is bounded in the summary", async () => {
  const html = `<html><body><p>${"w".repeat(100_000)}</p></body></html>`;
  const summary = buildResearchSummary(html, "https://x.nl", { maxVisibleTextChars: 4000 });
  assert.ok(summary.visibleText.length <= 4000);
});

test("E: weak homepage triggers a bounded subpage probe (max pages enforced)", async () => {
  let fetches = 0;
  const adapter = {
    id: "http-adapter",
    toolId: "http" as const,
    execute: async (request: { input?: { arguments?: { url?: string } }; executionId: string; toolId: string; taskId: string | null; agentId: string }) => {
      fetches += 1;
      const url = request.input?.arguments?.url ?? "";
      const body = url.includes("/contact")
        ? "<html><body><h1>Contact</h1><p>Bel ons gerust. Wij staan voor u klaar.</p><a href=\"mailto:info@x.nl\">mail</a></body></html>"
        : "<html><body><p>kort</p></body></html>";
      return {
        executionId: request.executionId,
        status: "SUCCEEDED" as const,
        toolId: request.toolId,
        taskId: request.taskId,
        agentId: String(request.agentId),
        output: { status: 200, ok: true, url, body, truncated: false },
        error: null,
        executionOccurred: true,
        startedAt: "t",
        completedAt: "t",
      };
    },
  };
  const core = buildCore(adapter);
  const result = await executeAssistantToolCall(toolCall("https://x.nl"), { core, lookup: PUBLIC_LOOKUP });
  assert.equal(result.ok, true);
  const summary = result.output as ResearchSummary;
  assert.ok(summary.pagesChecked.length >= 2, `expected subpage probe, got ${summary.pagesChecked.length}`);
  assert.ok(fetches <= 3, `bounded fetches, got ${fetches}`);
  assert.ok(summary.contactSignals.mailto.includes("info@x.nl"));
});

test("E2: strong homepage does not probe subpages (no unnecessary crawling)", async () => {
  let fetches = 0;
  const strongPage = `<html><head><title>Acme BV</title></head><body><h1>Acme BV</h1>
  ${"<p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat.</p>".repeat(14)}
  </body></html>`;
  const adapter = {
    id: "http-adapter",
    toolId: "http" as const,
    execute: async (request: { input?: { arguments?: { url?: string } }; executionId: string; toolId: string; taskId: string | null; agentId: string }) => {
      fetches += 1;
      return {
        executionId: request.executionId,
        status: "SUCCEEDED" as const,
        toolId: request.toolId,
        taskId: request.taskId,
        agentId: String(request.agentId),
        output: { status: 200, ok: true, url: request.input?.arguments?.url ?? "", body: strongPage, truncated: false },
        error: null,
        executionOccurred: true,
        startedAt: "t",
        completedAt: "t",
      };
    },
  };
  const core = buildCore(adapter);
  const result = await executeAssistantToolCall(toolCall("https://acme.nl"), { core, lookup: PUBLIC_LOOKUP });
  assert.equal((result.output as ResearchSummary).pagesChecked.length, 1);
  assert.equal(fetches, 1);
});

test("G-I: localhost, private IP and metadata addresses are blocked", async () => {
  for (const url of ["http://localhost:3000", "http://127.0.0.1/", "http://192.168.1.1/"]) {
    const result = await executeAssistantToolCall(toolCall(url), { lookup: PUBLIC_LOOKUP });
    assert.equal(result.ok, false, url);
    assert.equal(result.executionStatus, "REJECTED");
  }
  const metadata = await executeAssistantToolCall(toolCall("https://metadata.internal"), {
    lookup: async () => ["169.254.169.254"],
  });
  assert.equal(metadata.ok, false);
  assert.equal(metadata.error, "PRIVATE_ADDRESS_BLOCKED");
});

test("J: unsupported scheme is blocked", async () => {
  const result = await executeAssistantToolCall(toolCall("file:///etc/passwd"), { lookup: PUBLIC_LOOKUP });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /INVALID_URL/);
});

test("K: fetch failure is graceful (structured error, no throw)", async () => {
  const adapter = {
    id: "http-adapter",
    toolId: "http" as const,
    execute: async (request: { executionId: string; toolId: string; taskId: string | null; agentId: string }) => ({
      executionId: request.executionId,
      status: "FAILED" as const,
      toolId: request.toolId,
      taskId: request.taskId,
      agentId: String(request.agentId),
      output: null,
      error: "FETCH_TIMEOUT",
      executionOccurred: true,
      startedAt: "t",
      completedAt: "t",
    }),
  };
  const core = buildCore(adapter);
  const result = await executeAssistantToolCall(toolCall("https://slow.nl"), { core, lookup: PUBLIC_LOOKUP });
  assert.equal(result.ok, false);
  assert.equal(result.error, "FETCH_TIMEOUT");
});

test("L: partial research keeps homepage evidence when a subpage fails", async () => {
  // Weak homepage -> subpage probe runs; the subpage fetch FAILS, but the
  // homepage evidence must be preserved with a limitation instead of a crash.
  const adapter = {
    id: "http-adapter",
    toolId: "http" as const,
    execute: async (request: { input?: { arguments?: { url?: string } }; executionId: string; toolId: string; taskId: string | null; agentId: string }) => {
      const url = request.input?.arguments?.url ?? "";
      if (url.includes("/contact")) {
        return {
          executionId: request.executionId,
          status: "FAILED" as const,
          toolId: request.toolId,
          taskId: request.taskId,
          agentId: String(request.agentId),
          output: null,
          error: "FETCH_TIMEOUT",
          executionOccurred: true,
          startedAt: "t",
          completedAt: "t",
        };
      }
      return {
        executionId: request.executionId,
        status: "SUCCEEDED" as const,
        toolId: request.toolId,
        taskId: request.taskId,
        agentId: String(request.agentId),
        output: { status: 200, ok: true, url, body: "<html><body><p>kort</p></body></html>", truncated: false },
        error: null,
        executionOccurred: true,
        startedAt: "t",
        completedAt: "t",
      };
    },
  };
  const core = buildCore(adapter);
  const result = await executeAssistantToolCall(toolCall("https://x.nl"), { core, lookup: PUBLIC_LOOKUP });
  assert.equal(result.ok, true);
  const summary = result.output as ResearchSummary;
  assert.ok(summary.limitations.some((l) => l.startsWith("subpage_failed")), JSON.stringify(summary.limitations));
  assert.ok(summary.pagesChecked.includes("https://x.nl"));
});

test("M: chatbot script present -> YES with evidence and technologies", async () => {
  const html = `<html><head><script src="https://widget.intercom.io/widget/abc"></script></head>
  <body><h1>Acme</h1><p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat.</p></body></html>`;
  const core = buildCore(pageAdapter({ "https://acme.nl": { body: html } }));
  const result = await executeAssistantToolCall(toolCall("https://acme.nl"), { core, lookup: PUBLIC_LOOKUP });
  const summary = result.output as ResearchSummary;
  assert.equal(summary.chatbotDetection?.status, "yes");
  assert.ok(summary.technologies.includes("Intercom"));
  assert.ok((summary.chatbotDetection?.evidence ?? []).length > 0);
});

test("N: no chatbot found -> NO/UNKNOWN per evidence rules", async () => {
  const noChat = buildResearchSummary(SMALL_PAGE, "https://acme.nl");
  assert.equal(noChat.chatbotDetection?.status, "no");
  const tiny = buildResearchSummary("<html><body>Hi</body></html>", "https://tiny.nl");
  assert.equal(tiny.chatbotDetection?.status, "unknown");
});
