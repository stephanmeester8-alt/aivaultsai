import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  FilesystemAdapter,
  createAgentRuntime,
  createApprovalEngine,
  createEvidenceStore,
  createHandoffEngine,
  createInitialAgentRegistry,
  createInitialToolRegistry,
  createTaskEngine,
  createToolAdapterRegistry,
  createToolRegistry,
  isRuntimeError,
  FILESYSTEM_TOOL,
  HTTP_TOOL,
  type AgentRunRequest,
  type Handoff,
  type RunRecordEntry,
  type RunRecorder,
  type RuntimeError,
} from "../src/index.ts";

const agents = createInitialAgentRegistry();

function enabledFilesystem() {
  const tools = createToolRegistry();
  tools.register({ ...FILESYSTEM_TOOL, enabled: true });
  return tools;
}

function enabledHttp() {
  const tools = createToolRegistry();
  tools.register({ ...HTTP_TOOL, enabled: true });
  return tools;
}

function sampleHandoff(taskId: string, fromAgent: Handoff["fromAgent"] = "principal_engineer"): Handoff {
  return {
    handoffId: "handoff_runtime_001",
    fromAgent,
    toAgent: "cto_architect",
    taskId,
    objective: "Review implementation evidence",
    completedWork: "Executed a scoped filesystem read",
    findings: ["File content was read successfully"],
    decisions: ["Approach works"],
    evidenceIds: [],
    risks: ["None"],
    openQuestions: [],
    recommendedNextAction: "Review and close",
    createdAt: "2026-08-16T00:00:00.000Z",
  };
}

function readRequest(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
  return {
    runId: "run_001",
    agentId: "principal_engineer",
    objective: "Read a scoped file for review",
    toolId: "filesystem",
    requestedPermissions: ["FILESYSTEM_READ"],
    riskLevel: "LOW",
    expectedOutput: "File content",
    input: { capability: "FILESYSTEM_READ", arguments: { path: "notes.txt" } },
    ...overrides,
  };
}

class RecordingRecorder implements RunRecorder {
  readonly entries: RunRecordEntry[] = [];
  record(entry: RunRecordEntry): void {
    this.entries.push(entry);
  }
}

function harness(tools = enabledFilesystem(), options: { registerAdapter?: boolean } = {}) {
  const tasks = createTaskEngine(agents);
  const handoffs = createHandoffEngine(agents, tasks);
  const evidence = createEvidenceStore();
  const approvals = createApprovalEngine(agents, tasks);
  const adapters = createToolAdapterRegistry();
  const recorder = new RecordingRecorder();
  const runtime = createAgentRuntime({
    agents,
    tasks,
    handoffs,
    evidence,
    approvals,
    tools,
    adapters,
    recorder,
  });
  return { tasks, handoffs, evidence, approvals, adapters, recorder, runtime };
}

test("full lifecycle: LOW-risk read executes, completes, stores evidence", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-core-runtime-"));
  try {
    writeFileSync(path.join(dir, "notes.txt"), "runtime payload", "utf8");
    const { adapters, evidence, recorder, runtime, tasks } = harness();
    adapters.register(new FilesystemAdapter({ root: dir }));

    const started = runtime.submit(readRequest());
    assert.equal(started.state, "READY_FOR_EXECUTION");
    assert.equal(started.taskId, "task_run_001");

    const completed = await runtime.execute("run_001");
    assert.equal(completed.state, "COMPLETED");
    assert.equal(completed.execution?.status, "SUCCEEDED");
    assert.equal(completed.execution?.executionOccurred, true);
    assert.equal(completed.evidenceIds.length, 1);
    assert.equal(tasks.getTask("task_run_001").status, "REVIEW");

    const ev = evidence.getEvidence(completed.evidenceIds[0] as string);
    assert.equal(ev.provenance.executionOccurred, true);
    assert.equal(ev.provenance.executionId, "ex_run_001");
    assert.equal(ev.type, "FACT");

    const states = recorder.entries
      .filter((e) => e.kind === undefined || e.kind === "run")
      .map((e) => e.state);
    assert.deepEqual(states, [
      "RECEIVED",
      "PLANNED",
      "POLICY_CHECKED",
      "READY_FOR_EXECUTION",
      "EXECUTING",
      "COMPLETED",
    ]);
    // Rich artifacts are recorded too: task snapshot, execution, evidence.
    const kinds = recorder.entries.map((e) => e.kind ?? "run");
    assert.ok(kinds.includes("task"));
    assert.ok(kinds.includes("execution"));
    assert.ok(kinds.includes("evidence"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("HIGH risk requires approval before execution", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-core-runtime-"));
  try {
    const { adapters, recorder, runtime } = harness();
    adapters.register(new FilesystemAdapter({ root: dir, allowWrite: true }));

    const started = runtime.submit(
      readRequest({
        runId: "run_high",
        riskLevel: "HIGH",
        requestedPermissions: ["FILESYSTEM_WRITE"],
        input: { capability: "FILESYSTEM_WRITE", arguments: { path: "out.txt", content: "x" } },
      }),
    );
    assert.equal(started.state, "APPROVAL_REQUIRED");
    assert.ok(started.orchestration.approvalId);

    const approved = runtime.approve("run_high", "human:operator");
    // approve() = human decision (APPROVED) + policy re-check (READY_FOR_EXECUTION).
    assert.equal(approved.state, "READY_FOR_EXECUTION");

    const completed = await runtime.execute("run_high");
    assert.equal(completed.state, "COMPLETED");
    assert.equal(completed.execution?.status, "SUCCEEDED");

    const states = recorder.entries
      .filter((e) => e.kind === undefined || e.kind === "run")
      .map((e) => e.state);
    assert.deepEqual(states, [
      "RECEIVED",
      "PLANNED",
      "POLICY_CHECKED",
      "APPROVAL_REQUIRED",
      "APPROVED",
      "READY_FOR_EXECUTION",
      "EXECUTING",
      "COMPLETED",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a rejected approval fails the run", () => {
  const { runtime } = harness();
  const started = runtime.submit(
    readRequest({ runId: "run_rej", riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  assert.equal(started.state, "APPROVAL_REQUIRED");
  const rejected = runtime.reject("run_rej", "human:operator");
  assert.equal(rejected.state, "FAILED");
  assert.match(rejected.failureReason ?? "", /APPROVAL_REJECTED/);
});

test("policy DENY fails the run at submit", () => {
  const { runtime } = harness();
  const failed = runtime.submit(
    readRequest({ runId: "run_deny", agentId: "cto_architect" }),
  );
  assert.equal(failed.state, "FAILED");
  assert.match(failed.failureReason ?? "", /POLICY_DENIED/);
});

test("a disabled tool fails the run at submit", () => {
  const { runtime } = harness(createInitialToolRegistry());
  const failed = runtime.submit(readRequest({ runId: "run_disabled" }));
  assert.equal(failed.state, "FAILED");
  assert.match(failed.failureReason ?? "", /denied|disabled/i);
});

test("an authorized tool without an adapter fails explicitly at execution", async () => {
  // Empty adapter registry: filesystem is enabled and ALLOWed, but nothing
  // can execute. The run must fail with an explicit unavailable reason.
  const { runtime } = harness();
  const started = runtime.submit(readRequest({ runId: "run_noadapter" }));
  assert.equal(started.state, "READY_FOR_EXECUTION");
  const failed = await runtime.execute("run_noadapter");
  assert.equal(failed.state, "FAILED");
  assert.match(failed.failureReason ?? "", /No adapter is registered/i);
});

test("an adapter crash fails the run with the adapter error", async () => {
  const { adapters, runtime } = harness();
  adapters.register({
    id: "broken-fs",
    toolId: "filesystem",
    async execute() {
      throw new Error("broken");
    },
  });
  const started = runtime.submit(readRequest({ runId: "run_crash" }));
  assert.equal(started.state, "READY_FOR_EXECUTION");
  const failed = await runtime.execute("run_crash");
  assert.equal(failed.state, "FAILED");
  assert.match(failed.failureReason ?? "", /Adapter crashed/);
});

test("duplicate run ids are rejected", () => {
  const { runtime } = harness();
  runtime.submit(readRequest());
  assert.throws(
    () => runtime.submit(readRequest()),
    (error: unknown) => {
      assert.equal(isRuntimeError(error), true);
      assert.equal((error as RuntimeError).code, "RUN_ALREADY_EXISTS");
      return true;
    },
  );
});

test("unknown run → RUN_NOT_FOUND", () => {
  const { runtime } = harness();
  assert.throws(
    () => runtime.result("run_missing"),
    (error: unknown) => {
      assert.equal(isRuntimeError(error), true);
      assert.equal((error as RuntimeError).code, "RUN_NOT_FOUND");
      return true;
    },
  );
});

test("handoff after completion transitions to HANDED_OFF", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-core-runtime-"));
  try {
    writeFileSync(path.join(dir, "notes.txt"), "x", "utf8");
    const { adapters, runtime } = harness();
    adapters.register(new FilesystemAdapter({ root: dir }));
    runtime.submit(readRequest({ runId: "run_handoff" }));
    await runtime.execute("run_handoff");
    const handed = runtime.handoff("run_handoff", sampleHandoff("task_run_handoff"));
    assert.equal(handed.state, "HANDED_OFF");
    assert.equal(handed.handoffId, "handoff_runtime_001");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("handoff is refused before completion", async () => {
  const { runtime } = harness();
  runtime.submit(readRequest({ runId: "run_early_handoff" }));
  assert.throws(
    () => runtime.handoff("run_early_handoff", sampleHandoff("task_run_early_handoff")),
    (error: unknown) => {
      assert.equal(isRuntimeError(error), true);
      assert.equal((error as RuntimeError).code, "INVALID_STATE_TRANSITION");
      return true;
    },
  );
});

test("a failing recorder never breaks the run", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-core-runtime-"));
  try {
    writeFileSync(path.join(dir, "notes.txt"), "x", "utf8");
    const tasks = createTaskEngine(agents);
    const handoffs = createHandoffEngine(agents, tasks);
    const evidence = createEvidenceStore();
    const approvals = createApprovalEngine(agents, tasks);
    const adapters = createToolAdapterRegistry();
    adapters.register(new FilesystemAdapter({ root: dir }));
    const throwingRecorder: RunRecorder = {
      record() {
        throw new Error("db down");
      },
    };
    const runtime = createAgentRuntime({
      agents,
      tasks,
      handoffs,
      evidence,
      approvals,
      tools: enabledFilesystem(),
      adapters,
      recorder: throwingRecorder,
    });
    runtime.submit(readRequest({ runId: "run_rec" }));
    const completed = await runtime.execute("run_rec");
    assert.equal(completed.state, "COMPLETED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
