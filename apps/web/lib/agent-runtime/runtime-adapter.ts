/**
 * Server-side application adapter between the Next.js app and agent-core
 * (TASK 24 — FASE 8/9).
 *
 * Architecture:
 *   apps/web (server-only) -> runtime-adapter -> agent-core runtime
 *
 * NEVER imported from client components; agent-core runs exclusively on the
 * server (route handlers / node runtime). No secrets are passed to the
 * browser. The only tool enabled is the read-only, SSRF-guarded HTTP adapter
 * with tight bounds; browser/terminal/mcp/filesystem stay disabled.
 *
 * agent-core is imported lazily (value imports) so this module stays loadable
 * under node's type stripping (files under node_modules are never stripped).
 * Type-only imports are erased at runtime and therefore safe statically.
 *
 * Integration: after Customer-Zero creates a lead, one safe runtime task
 * runs per conversation (idempotent via conversations.metadata). The run is
 * recorded through the Postgres run recorder (non-fatal) when the agent
 * runtime tables exist.
 */
import { randomUUID } from "node:crypto";
import type {
  AgentRuntime,
  AgentRunRequest,
  RunRecorder,
  RunRecordEntry,
  ToolDefinition,
} from "@aivaultsai/agent-core";
import { SITE_URL } from "../site.ts";
import { bareHostname, validateUrl } from "../seo/url-policy.ts";
import {
  checkDnsPolicy,
  checkHostnamePolicy,
  defaultDnsLookup,
} from "../prospect-run/website-research.ts";
import {
  buildResearchSummary,
  mergeResearchSummary,
} from "../assistant/research-summary.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minimal tagged-query contract, kept injectable for idempotency tests. */
export type RuntimeSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

/**
 * Atomically reserve the one runtime run permitted for a conversation.
 *
 * A read followed by a write is not safe here: concurrent serverless
 * invocations can both observe an empty value and execute duplicate work.
 * The conditional update lets Postgres serialize the claim instead.
 */
export async function claimConversationRuntimeRun(
  sql: RuntimeSql,
  conversationId: string,
  runId: string,
): Promise<boolean> {
  const rows = await sql`
    UPDATE conversations
    SET
      metadata = COALESCE(metadata, '{}'::jsonb)
        || ${({ runtime_run_id: runId })}::jsonb,
      last_activity_at = NOW()
    WHERE conversation_id = ${conversationId}::uuid
      AND metadata->>'runtime_run_id' IS NULL
    RETURNING conversation_id
  `;
  return rows.length > 0;
}

/**
 * The HTTP tool is enabled explicitly here — the operator opt-in required by
 * the ToolDefinition contract ("nothing may execute until a task explicitly
 * enables a tool and registers an adapter"). All other tools stay disabled.
 */
function enabledHttpTool(core: typeof import("@aivaultsai/agent-core")): ToolDefinition {
  return { ...core.HTTP_TOOL, enabled: true };
}

/**
 * Assistant website-research transport limits (explicit and configurable).
 * Transport cap != LLM context cap: the adapter may receive a bounded large
 * page (truncated), while the LLM only ever sees the compact research
 * summary built in research-summary.ts.
 */
export const ASSISTANT_HTTP_MAX_BYTES = 2 * 1024 * 1024;
export const ASSISTANT_HTTP_TIMEOUT_MS = 10_000;
export const ASSISTANT_HTTP_MAX_REDIRECTS = 3;
/** Max pages researched per tool call (homepage + subpages). */
export const ASSISTANT_RESEARCH_MAX_PAGES = 3;
/** Subpages probed (in order) only when the homepage gives insufficient evidence. */
export const ASSISTANT_RESEARCH_SUBPAGES = [
  "/contact",
  "/contact-us",
  "/over-ons",
  "/about",
  "/diensten",
  "/services",
  "/klantenservice",
  "/support",
  "/faq",
  "/prijzen",
  "/offerte",
] as const;

function buildAdapterRegistry(core: typeof import("@aivaultsai/agent-core")) {
  const registry = new core.ToolAdapterRegistry();
  registry.register(
    new core.HttpAdapter({
      maxBytes: ASSISTANT_HTTP_MAX_BYTES,
      timeoutMs: ASSISTANT_HTTP_TIMEOUT_MS,
      maxRedirects: ASSISTANT_HTTP_MAX_REDIRECTS,
    }),
  );
  return registry;
}

/**
 * Recorder writes are fire-and-forget inside agent-core by design. In
 * serverless the function may be frozen right after the response, dropping
 * pending writes — so the adapter tracks them and flushes before returning.
 */
const pendingRecorderWrites = new Set<Promise<void>>();

/** Append-only audit sink; a failed write never breaks the run. */
function createLazyRecorder(): RunRecorder {
  return {
    record(entry: RunRecordEntry) {
      try {
        const promise = (async () => {
          const {
            createDefaultPostgresRunRecorder,
          } = await import("../runtime/postgres-run-recorder");
          const recorder = await createDefaultPostgresRunRecorder();
          return recorder.record(entry as never);
        })();
        pendingRecorderWrites.add(promise);
        promise.catch(() => {
          /* recorder failures are non-fatal */
        });
        promise.then(() => {
          pendingRecorderWrites.delete(promise);
        });
        return promise;
      } catch (error) {
        console.error(
          "[agent-runtime] recorder failed",
          error instanceof Error ? error.name : "unknown",
        );
      }
    },
  };
}

async function flushRecorderWrites(): Promise<void> {
  if (pendingRecorderWrites.size === 0) return;
  await Promise.allSettled([...pendingRecorderWrites]);
}

/**
 * Fresh runtime per invocation: stateless across requests (recorder persists).
 * Value imports of agent-core are resolved lazily here.
 */
async function buildRuntimeEngines() {
  const core = await import("@aivaultsai/agent-core");
  const agents = core.createInitialAgentRegistry();
  const tasks = core.createTaskEngine(agents);
  const tools = core.createToolRegistry();
  tools.register(enabledHttpTool(core));
  const adapters = buildAdapterRegistry(core);
  const approvals = core.createApprovalEngine(agents, tasks);
  const evidence = core.createEvidenceStore();
  const handoffs = core.createHandoffEngine(agents, tasks);
  return { core, agents, tasks, tools, adapters, approvals, evidence, handoffs };
}

async function buildRuntime(): Promise<AgentRuntime> {
  const { core, agents, tasks, handoffs, evidence, approvals, tools, adapters } =
    await buildRuntimeEngines();
  return core.createAgentRuntime({
    agents,
    tasks,
    handoffs,
    evidence,
    approvals,
    tools,
    adapters,
    recorder: createLazyRecorder(),
  });
}

export interface RuntimeTaskOutcome {
  ran: boolean;
  skipped?: "invalid_conversation_id" | "already_ran";
  runId?: string;
  state?: string;
  executionOccurred?: boolean;
  executionStatus?: string | null;
  evidenceIds?: string[];
  error?: string | null;
}

/**
 * Run one safe agent-runtime task for a conversation that just produced a
 * lead. Idempotent: one run per conversation (persisted in
 * conversations.metadata). Never throws — the funnel stays non-fatal.
 */
export async function runConversationRuntimeTask(
  conversationId: string,
): Promise<RuntimeTaskOutcome> {
  if (!UUID_RE.test(conversationId)) {
    return { ran: false, skipped: "invalid_conversation_id" };
  }

  try {
    const { sql } = await import("../db/client");

    const runId = `run_${conversationId}`;
    const claimed = await claimConversationRuntimeRun(
      sql as unknown as RuntimeSql,
      conversationId,
      runId,
    );
    if (!claimed) {
      const existing = await sql`
        SELECT metadata->>'runtime_run_id' AS run_id
        FROM conversations
        WHERE conversation_id = ${conversationId}::uuid
        LIMIT 1
      `;
      return {
        ran: false,
        skipped: "already_ran",
        ...(existing[0]?.run_id ? { runId: String(existing[0].run_id) } : {}),
      };
    }

    const request: AgentRunRequest = {
      runId,
      agentId: "research_intelligence",
      objective: `Post-lead verification for conversation ${conversationId}`,
      toolId: "http",
      requestedPermissions: ["API_REQUEST"],
      riskLevel: "MEDIUM",
      expectedOutput:
        "Verified public site reachability with execution evidence",
      priority: 1,
      input: {
        capability: "API_REQUEST",
        arguments: {
          url: `${SITE_URL}/sitemap.xml`,
          maxBytes: 32 * 1024,
        },
      },
    };

    const runtime = await buildRuntime();
    const submitted = runtime.submit(request);
    const run =
      submitted.state === "READY_FOR_EXECUTION"
        ? await runtime.execute(runId)
        : submitted;

    const execution = run.execution;
    const outcome: RuntimeTaskOutcome = {
      ran: true,
      runId,
      state: run.state,
      executionOccurred: execution?.executionOccurred ?? false,
      executionStatus: execution?.status ?? null,
      evidenceIds: [...run.evidenceIds],
      error: run.failureReason,
    };

    // Flush pending recorder writes (evidence/execution/run rows) before the
    // serverless function returns; otherwise they may be dropped.
    await flushRecorderWrites();

    return outcome;
  } catch (error) {
    console.error(
      "[agent-runtime] runtime task failed",
      error instanceof Error ? error.name : "unknown",
    );
    return {
      ran: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** A function-call requested by the website assistant's model (untrusted). */
export interface AssistantToolCall {
  callId: string;
  name: string;
  /** Raw JSON string from the model (untrusted). */
  arguments: string;
}

export interface AssistantToolExecution {
  ok: boolean;
  output: unknown;
  error: string | null;
  executionStatus: string | null;
  evidenceIds: string[];
}

export interface AssistantToolDeps {
  /** Pre-built engines + gate (tests); defaults to the production core. */
  core?: AssistantToolCore;
  /** DNS resolver for the pre-flight SSRF check (tests). */
  lookup?: (host: string) => Promise<readonly string[]>;
  log?: (message: string) => void;
}

/**
 * The assistant tool executes through the EXISTING ExecutionGate with the
 * same engines as the Agent Runtime (agents, tasks, tools, approvals,
 * adapters, evidence, recorder) — no second runtime, no direct fetch.
 */
export interface AssistantToolCore {
  tasks: import("@aivaultsai/agent-core").TaskEngine;
  gate: import("@aivaultsai/agent-core").ExecutionGate;
  evidence: import("@aivaultsai/agent-core").EvidenceStore;
  recorder: RunRecorder;
}

/** Production core: the same engine instances the Agent Runtime uses. */
export async function buildAssistantToolCore(): Promise<AssistantToolCore> {
  const { core, agents, tasks, tools, adapters, approvals, evidence } =
    await buildRuntimeEngines();
  return {
    tasks,
    gate: core.createExecutionGate({ agents, tasks, tools, approvals, adapters }),
    evidence,
    recorder: createLazyRecorder(),
  };
}

export const ASSISTANT_WEBSITE_RESEARCH_TOOL = "assistant_website_research";

/** Homepage evidence threshold below which relevant subpages are probed. */
const ASSISTANT_RESEARCH_MIN_TEXT = 800;

/**
 * Bridge: execute ONE assistant tool-call through the EXISTING ExecutionGate
 * (PolicyEngine -> ExecutionGate -> HttpAdapter -> evidence). The model never
 * fetches anything itself; every call is validated, permission-checked and
 * executed by the gate. Fail-closed: unknown tool, malformed arguments,
 * invalid/private URLs and execution failures return structured errors.
 *
 * The LLM only ever receives a COMPACT normalized research summary (see
 * research-summary.ts); raw HTML never leaves the bridge. When the homepage
 * gives insufficient evidence, a bounded number of relevant subpages is
 * probed (every page through the same gate with its own SSRF pre-flight).
 */
export async function executeAssistantToolCall(
  call: AssistantToolCall,
  deps: AssistantToolDeps = {},
): Promise<AssistantToolExecution> {
  const log = deps.log ?? ((message: string) => console.info(`[assistant-tool] ${message}`));

  if (call.name !== ASSISTANT_WEBSITE_RESEARCH_TOOL) {
    return { ok: false, output: null, error: "UNKNOWN_TOOL", executionStatus: "REJECTED", evidenceIds: [] };
  }

  let parsed: { url?: unknown };
  try {
    parsed = JSON.parse(call.arguments) as { url?: unknown };
  } catch {
    return { ok: false, output: null, error: "INVALID_TOOL_ARGUMENTS", executionStatus: "REJECTED", evidenceIds: [] };
  }
  if (typeof parsed.url !== "string" || parsed.url.trim().length === 0) {
    return { ok: false, output: null, error: "MISSING_URL", executionStatus: "REJECTED", evidenceIds: [] };
  }
  const url = parsed.url.trim();

  // Pre-flight SSRF guards (defense in depth — the HttpAdapter re-checks
  // every hop before any request is sent).
  const validation = validateUrl(url);
  if (!validation.ok) {
    return { ok: false, output: null, error: `INVALID_URL: ${validation.reason}`, executionStatus: "REJECTED", evidenceIds: [] };
  }
  const hostPolicy = checkHostnamePolicy(validation.url.hostname);
  if (!hostPolicy.ok) {
    return { ok: false, output: null, error: hostPolicy.reason, executionStatus: "REJECTED", evidenceIds: [] };
  }
  const dnsPolicy = await checkDnsPolicy(
    bareHostname(validation.url),
    deps.lookup ?? defaultDnsLookup,
  );
  if (!dnsPolicy.ok) {
    return { ok: false, output: null, error: dnsPolicy.reason, executionStatus: "REJECTED", evidenceIds: [] };
  }

  const core = deps.core ?? (await buildAssistantToolCore());
  const taskId = `assistant_task_${randomUUID()}`;
  const startedAt = Date.now();

  try {
    core.tasks.createTask({
      taskId,
      title: "Website research (assistant tool)",
      objective: `Website research requested by the website assistant: ${url}`,
      createdBy: "system",
      assignedTo: null,
      priority: 1,
      status: "READY",
      riskLevel: "MEDIUM",
      inputs: {
        toolId: "http",
        requestedPermissions: ["API_REQUEST"],
        invocation: { capability: "API_REQUEST", arguments: { url } },
      },
      expectedOutput: "Fetched public page content with execution evidence",
      dependencies: [],
      evidenceRequired: false,
      failureReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);

    const fetchPage = async (pageUrl: string, pageLabel: string) => {
      const executionId = `assistant_exec_${randomUUID()}`;
      log(`website_research_started url=${pageUrl} label=${pageLabel}`);
      const execution = await core.gate.execute({
        executionId,
        taskId,
        agentId: "research_intelligence",
        toolId: "http",
        requestedAction: ASSISTANT_WEBSITE_RESEARCH_TOOL,
        requestedPermissions: ["API_REQUEST"],
        riskLevel: "MEDIUM",
        approvalId: null,
        input: {
          capability: "API_REQUEST",
          arguments: { url: pageUrl },
        },
      });
      log(
        `website_fetch_completed url=${pageUrl} status=${execution.status} error=${execution.error ?? "none"}`,
      );

      // Append-only evidence + recorder (non-fatal; audit trail).
      if (execution.executionOccurred) {
        try {
          core.evidence.createEvidence({
            evidenceId: randomUUID(),
            claim: `Website research executed: ${pageUrl}`,
            type: "FACT",
            source: pageUrl,
            sourceType: "public_website",
            supportingData: execution.status,
            confidence: "HIGH",
            provenance: {
              actor: "research_intelligence",
              toolId: "http",
              capability: "API_REQUEST",
              method: ASSISTANT_WEBSITE_RESEARCH_TOOL,
              origin: "agent_research",
              executionOccurred: true,
              executionId,
            },
            createdAt: new Date().toISOString(),
          } as never);
        } catch {
          /* evidence is non-fatal */
        }
      }
      try {
        core.recorder.record({
          runId: taskId,
          state: execution.status,
          kind: "execution",
          taskId,
          agentId: "research_intelligence",
          toolId: "http",
          timestamp: new Date().toISOString(),
          data: { executionId, url: pageUrl, error: execution.error },
        } as never);
      } catch {
        /* recorder is non-fatal */
      }
      return execution;
    };

    const homepage = await fetchPage(url, "homepage");
    if (homepage.status !== "SUCCEEDED") {
      return {
        ok: false,
        output: null,
        error: homepage.error ?? `EXECUTION_${homepage.status}`,
        executionStatus: homepage.status,
        evidenceIds: [],
      };
    }
    const homepageOutput = homepage.output as { status?: number; ok?: boolean; url?: string; body?: string; truncated?: boolean };
    const html = homepageOutput.body ?? "";
    log(
      `website_fetch_limited url=${url} truncated=${homepageOutput.truncated === true} bytes=${html.length}`,
    );

    let summary = buildResearchSummary(html, homepageOutput.url ?? url);
    if (homepageOutput.truncated === true) {
      summary = { ...summary, truncated: true, limitations: [...summary.limitations, "response_truncated"] };
    }
    log(`website_page_analyzed url=${summary.url} detection=${summary.chatbotDetection?.status ?? "n/a"}`);

    // Bounded subpage research: only when the homepage gives insufficient
    // evidence; every page through the same gate with its own SSRF pre-flight.
    const homepageWeak =
      summary.visibleText.length < ASSISTANT_RESEARCH_MIN_TEXT ||
      summary.chatbotDetection?.status === "unknown";
    if (homepageWeak && summary.pagesChecked.length < ASSISTANT_RESEARCH_MAX_PAGES) {
      const base = new URL(summary.url);
      const budget = ASSISTANT_RESEARCH_MAX_PAGES - summary.pagesChecked.length;
      for (const path of ASSISTANT_RESEARCH_SUBPAGES) {
        if (summary.pagesChecked.length >= ASSISTANT_RESEARCH_MAX_PAGES) break;
        const subUrl = new URL(path, base).toString();
        const subValidation = validateUrl(subUrl);
        const subHost = subValidation.ok
          ? checkHostnamePolicy(subValidation.url.hostname)
          : { ok: false as const, reason: "INVALID_URL" };
        let subDns: { ok: true } | { ok: false; reason: string };
        if (subValidation.ok && subHost.ok) {
          subDns = await checkDnsPolicy(bareHostname(subValidation.url), deps.lookup ?? defaultDnsLookup);
        } else {
          subDns = { ok: false, reason: subHost.ok ? "INVALID_URL" : subHost.reason };
        }
        if (!subValidation.ok || !subHost.ok || !subDns.ok) {
          summary = {
            ...summary,
            limitations: [...summary.limitations, `subpage_blocked:${path}`],
          };
          continue;
        }
        const subExecution = await fetchPage(subUrl, `subpage:${path}`);
        if (subExecution.status !== "SUCCEEDED") {
          summary = {
            ...summary,
            limitations: [...summary.limitations, `subpage_failed:${path}:${subExecution.error ?? subExecution.status}`],
          };
          continue;
        }
        const subOutput = subExecution.output as { url?: string; body?: string; truncated?: boolean };
        const subSummary = buildResearchSummary(subOutput.body ?? "", subOutput.url ?? subUrl);
        summary = mergeResearchSummary(summary, subSummary);
        if (subOutput.truncated === true) {
          summary = { ...summary, truncated: true };
        }
        log(`website_page_analyzed url=${subUrl} detection=${subSummary.chatbotDetection?.status ?? "n/a"}`);
        if (budget - 1 <= 0) break;
      }
    }

    log(
      `website_research_completed pages=${summary.pagesChecked.length} durationMs=${Date.now() - startedAt} detection=${summary.chatbotDetection?.status ?? "n/a"}`,
    );

    return {
      ok: true,
      output: summary,
      error: null,
      executionStatus: homepage.status,
      evidenceIds: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`tool ${call.callId} failed: ${message.slice(0, 200)}`);
    return {
      ok: false,
      output: null,
      error: message.slice(0, 300),
      executionStatus: "FAILED",
      evidenceIds: [],
    };
  }
}
