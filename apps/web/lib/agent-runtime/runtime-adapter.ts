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
import type {
  AgentRuntime,
  AgentRunRequest,
  RunRecorder,
  RunRecordEntry,
  ToolDefinition,
} from "@aivaultsai/agent-core";
import { SITE_URL } from "../site.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The HTTP tool is enabled explicitly here — the operator opt-in required by
 * the ToolDefinition contract ("nothing may execute until a task explicitly
 * enables a tool and registers an adapter"). All other tools stay disabled.
 */
function enabledHttpTool(core: typeof import("@aivaultsai/agent-core")): ToolDefinition {
  return { ...core.HTTP_TOOL, enabled: true };
}

function buildAdapterRegistry(core: typeof import("@aivaultsai/agent-core")) {
  const registry = new core.ToolAdapterRegistry();
  registry.register(
    new core.HttpAdapter({
      maxBytes: 32 * 1024,
      timeoutMs: 5_000,
      maxRedirects: 2,
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
async function buildRuntime(): Promise<AgentRuntime> {
  const core = await import("@aivaultsai/agent-core");
  const agents = core.createInitialAgentRegistry();
  const tasks = core.createTaskEngine(agents);
  const tools = core.createToolRegistry();
  tools.register(enabledHttpTool(core));
  return core.createAgentRuntime({
    agents,
    tasks,
    handoffs: core.createHandoffEngine(agents, tasks),
    evidence: core.createEvidenceStore(),
    approvals: core.createApprovalEngine(agents, tasks),
    tools,
    adapters: buildAdapterRegistry(core),
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

    const existing = await sql`
      SELECT metadata->>'runtime_run_id' AS run_id
      FROM conversations
      WHERE conversation_id = ${conversationId}::uuid
      LIMIT 1
    `;
    if (existing[0]?.run_id) {
      return {
        ran: false,
        skipped: "already_ran",
        runId: String(existing[0].run_id),
      };
    }

    const runId = `run_${conversationId}`;
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

    // Persist the run id once the run reached a terminal state so the step
    // never repeats for this conversation. The object is passed directly
    // (no JSON.stringify) so both the neon client and postgres.js store a
    // jsonb OBJECT, never a double-encoded jsonb string.
    if (run.state === "COMPLETED" || run.state === "FAILED") {
      await sql`
        UPDATE conversations
        SET
          metadata = metadata
            || ${({ runtime_run_id: runId })}::jsonb,
          last_activity_at = NOW()
        WHERE conversation_id = ${conversationId}::uuid
      `;
    }

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
