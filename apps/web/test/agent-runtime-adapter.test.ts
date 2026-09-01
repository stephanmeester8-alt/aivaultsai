import assert from "node:assert/strict";
import { test } from "node:test";

import * as core from "../../../packages/agent-core/src/index.ts";

import {
  claimConversationRuntimeRun,
  executeAssistantToolCall,
  runConversationRuntimeTask,
  type AssistantToolCall,
  type AssistantToolCore,
  type RuntimeSql,
} from "../lib/agent-runtime/runtime-adapter.ts";

function toolCall(overrides: Partial<AssistantToolCall> = {}): AssistantToolCall {
  return {
    callId: "call-1",
    name: "assistant_website_research",
    arguments: JSON.stringify({ url: "https://example.com" }),
    ...overrides,
  };
}

function fakeAdapter(output: unknown) {
  return {
    id: "http-adapter",
    toolId: "http" as const,
    execute: async (request: { executionId: string; toolId: string; taskId: string | null; agentId: string }) => ({
      executionId: request.executionId,
      status: "SUCCEEDED" as const,
      toolId: request.toolId,
      taskId: request.taskId,
      agentId: String(request.agentId),
      output,
      error: null,
      executionOccurred: true,
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-01T00:00:00.000Z",
    }),
  };
}

/**
 * Build a REAL Agent Runtime core (PolicyEngine + ExecutionGate) with the
 * production tool registry and an injected fake adapter â€” the bridge is then
 * exercised against the actual gate, exactly as in production.
 */
function buildToolCore(options: {
  adapter?: { id: string; toolId: "http"; execute: (...args: never[]) => Promise<unknown> };
  enabled?: boolean;
  allowedTools?: readonly string[];
}): AssistantToolCore {
  let agents = core.createInitialAgentRegistry();
  if (options.allowedTools) {
    // Restricted registry: research_intelligence WITHOUT the http tool, so
    // the PolicyEngine must DENY the assistant tool call.
    const allTools = ["browser", "filesystem", "terminal", "mcp", "http"] as const;
    agents = core.createAgentRegistry();
    agents.register({
      ...core.RESEARCH_INTELLIGENCE,
      allowedTools: [...options.allowedTools] as readonly typeof allTools[number][],
      prohibitedTools: allTools.filter(
        (tool): tool is (typeof allTools)[number] => !options.allowedTools!.includes(tool),
      ),
    });
  }
  const tasks = core.createTaskEngine(agents);
  const tools = core.createToolRegistry();
  tools.register({ ...core.HTTP_TOOL, enabled: options.enabled ?? true });
  const adapters = new core.ToolAdapterRegistry();
  if (options.adapter) adapters.register(options.adapter as never);
  const approvals = core.createApprovalEngine(agents, tasks);
  return {
    tasks,
    gate: core.createExecutionGate({ agents, tasks, tools, approvals, adapters }),
    evidence: core.createEvidenceStore(),
    recorder: { record: () => {} },
  } as unknown as AssistantToolCore;
}

test("invalid conversation id is refused before any database access", async () => {
  const outcome = await runConversationRuntimeTask("not-a-uuid");
  assert.equal(outcome.ran, false);
  assert.equal(outcome.skipped, "invalid_conversation_id");
  assert.equal(outcome.error, undefined);
});

test("missing input is refused (empty string)", async () => {
  const outcome = await runConversationRuntimeTask("");
  assert.equal(outcome.ran, false);
  assert.equal(outcome.skipped, "invalid_conversation_id");
});

test("atomically claims only one runtime run per conversation", async () => {
  let claimed = false;
  const sql: RuntimeSql = async () => {
    if (claimed) return [];
    claimed = true;
    return [{ conversation_id: "11111111-1111-4111-8111-111111111111" }];
  };

  const first = await claimConversationRuntimeRun(
    sql,
    "11111111-1111-4111-8111-111111111111",
    "run_11111111-1111-4111-8111-111111111111",
  );
  const second = await claimConversationRuntimeRun(
    sql,
    "11111111-1111-4111-8111-111111111111",
    "run_11111111-1111-4111-8111-111111111111",
  );

  assert.equal(first, true);
  assert.equal(second, false);
});

// ---------------------------------------------------------------------------
// Assistant tool bridge â€” exercised against the REAL ExecutionGate and
// PolicyEngine (fake HTTP adapter only; the real HttpAdapter SSRF coverage
// lives in the agent-core adapters suite).
// ---------------------------------------------------------------------------

test("bridge: unknown tool is rejected before any execution", async () => {
  const result = await executeAssistantToolCall(
    toolCall({ name: "some_other_tool" }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "UNKNOWN_TOOL");
  assert.equal(result.executionStatus, "REJECTED");
});

test("bridge: malformed arguments and missing URL are rejected", async () => {
  const malformed = await executeAssistantToolCall(
    toolCall({ arguments: "not-json" }),
  );
  assert.equal(malformed.error, "INVALID_TOOL_ARGUMENTS");

  const missing = await executeAssistantToolCall(
    toolCall({ arguments: "{}" }),
  );
  assert.equal(missing.error, "MISSING_URL");
});

test("bridge: localhost and IP literals are blocked before the runtime", async () => {
  for (const url of ["http://localhost:3000", "http://127.0.0.1/", "http://192.168.1.1/"]) {
    const result = await executeAssistantToolCall(
      toolCall({ arguments: JSON.stringify({ url }) }),
    );
    assert.equal(result.ok, false, url);
    assert.ok(["LOCALHOST_BLOCKED", "IP_LITERAL_BLOCKED"].includes(result.error ?? ""), url);
    assert.equal(result.executionStatus, "REJECTED");
  }
});

test("bridge: private address via DNS is blocked (metadata endpoint)", async () => {
  const result = await executeAssistantToolCall(toolCall(), {
    lookup: async () => ["169.254.169.254"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "PRIVATE_ADDRESS_BLOCKED");
});

test("bridge: unsupported scheme is rejected", async () => {
  const result = await executeAssistantToolCall(
    toolCall({ arguments: JSON.stringify({ url: "file:///etc/passwd" }) }),
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /INVALID_URL/);
});

test("bridge: tool call passes the real gate and reaches the adapter", async () => {
  const html = `<html><head><title>Acme BV</title></head><body><h1>Acme BV</h1>
  ${"<p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat.</p>".repeat(14)}
  </body></html>`;
  const core = buildToolCore({
    adapter: fakeAdapter({ status: 200, ok: true, url: "https://example.com", body: html, truncated: false }),
  });
  const result = await executeAssistantToolCall(toolCall(), { core, lookup: async () => ["93.184.216.34"] });
  assert.equal(result.ok, true);
  assert.equal(result.executionStatus, "SUCCEEDED");
  const summary = result.output as { title: string | null; pagesChecked: string[]; chatbotDetection: { status: string } | null };
  assert.equal(summary.title, "Acme BV");
  assert.equal(summary.pagesChecked.length, 1);
  assert.ok(summary.chatbotDetection);
});

test("bridge: disabled tool is blocked by the gate (NOT executed)", async () => {
  const core = buildToolCore({
    adapter: fakeAdapter({ status: 200, body: "x" }),
    enabled: false,
  });
  const result = await executeAssistantToolCall(toolCall(), { core, lookup: async () => ["93.184.216.34"] });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /disabled/i);
  assert.equal(result.executionStatus, "REJECTED");
});

test("bridge: missing adapter is NOT_IMPLEMENTED (nothing executes)", async () => {
  const core = buildToolCore({ adapter: undefined });
  const result = await executeAssistantToolCall(toolCall(), { core, lookup: async () => ["93.184.216.34"] });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /No adapter|unavailable/i);
  assert.equal(result.executionStatus, "NOT_IMPLEMENTED");
});

test("bridge: policy denies execution when the agent lacks the permission", async () => {
  // research_intelligence without the http tool: PolicyEngine DENY before
  // any adapter runs (the adapter would have succeeded if reached).
  const core = buildToolCore({
    adapter: fakeAdapter({ status: 200, body: "x" }),
    allowedTools: [],
  });
  const result = await executeAssistantToolCall(toolCall(), { core, lookup: async () => ["93.184.216.34"] });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /prohibited|denied|permission/i);
  assert.equal(result.executionStatus, "REJECTED");
});

test("bridge: execution failure never throws; structured error is returned", async () => {
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
      error: "response exceeds maxBytes",
      executionOccurred: true,
      startedAt: "t",
      completedAt: "t",
    }),
  };
  const core = buildToolCore({ adapter });
  const result = await executeAssistantToolCall(toolCall(), { core, lookup: async () => ["93.184.216.34"] });
  assert.equal(result.ok, false);
  assert.equal(result.error, "response exceeds maxBytes");
  assert.equal(result.executionStatus, "FAILED");
});
