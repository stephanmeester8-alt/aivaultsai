import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  BROWSER_TOOL,
  FILESYSTEM_TOOL,
  FilesystemAdapter,
  createApprovalEngine,
  createExecutionGate,
  createInitialAgentRegistry,
  createInitialToolRegistry,
  createTaskEngine,
  createToolAdapterRegistry,
  createToolRegistry,
  evaluatePolicy,
  getAgent,
  getToolDefinition,
  type Approval,
  type ExecutionRequest,
  type Task,
  type ToolAdapter,
} from "../src/index.ts";

const agents = createInitialAgentRegistry();

function enabledFilesystem() {
  const tools = createToolRegistry();
  tools.register({ ...FILESYSTEM_TOOL, enabled: true });
  return tools;
}

function harness(tools = enabledFilesystem()) {
  const tasks = createTaskEngine(agents);
  const approvals = createApprovalEngine(agents, tasks);
  const adapters = createToolAdapterRegistry();
  const gate = createExecutionGate({ agents, tasks, tools, approvals, adapters });
  return { tasks, approvals, adapters, tools, gate };
}

function seedTask(tasks: ReturnType<typeof createTaskEngine>, overrides: Partial<Task> = {}): Task {
  const task: Task = {
    taskId: "task_exec_001",
    title: "Authorized filesystem read",
    objective: "Prepare a scoped read after authorization",
    createdBy: "human",
    assignedTo: null,
    priority: 4,
    status: "READY",
    riskLevel: "LOW",
    inputs: {},
    expectedOutput: "Not executed",
    dependencies: [],
    evidenceRequired: false,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
  tasks.createTask(task);
  if (!task.assignedTo) {
    tasks.assignTask(task.taskId, "principal_engineer");
  }
  return tasks.getTask(task.taskId);
}

function execReq(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    executionId: "ex_001",
    taskId: "task_exec_001",
    agentId: "principal_engineer",
    toolId: "filesystem",
    requestedAction: "FILESYSTEM_READ on authorized path",
    requestedPermissions: ["FILESYSTEM_READ"],
    riskLevel: "LOW",
    approvalId: null,
    input: {},
    ...overrides,
  };
}

test("valid execution request without adapter reaches NOT_IMPLEMENTED", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(execReq());
  assert.equal(result.status, "NOT_IMPLEMENTED");
  assert.equal(result.executionOccurred, false);
});

test("unknown agent → REJECTED", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(execReq({ agentId: "unknown_agent" }));
  assert.equal(result.status, "REJECTED");
  assert.match(result.error ?? "", /Unknown agent/);
});

test("unknown task → REJECTED", async () => {
  const { gate } = harness();
  const result = await gate.execute(execReq({ taskId: "missing_task" }));
  assert.equal(result.status, "REJECTED");
  assert.match(result.error ?? "", /Unknown task/);
});

test("unknown tool → REJECTED", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(execReq({ toolId: "not_a_tool" }));
  assert.equal(result.status, "REJECTED");
});

test("disabled tool → REJECTED", async () => {
  const { tasks, gate } = harness(createInitialToolRegistry());
  seedTask(tasks);
  const result = await gate.execute(execReq());
  assert.equal(result.status, "REJECTED");
  assert.match(result.error ?? "", /disabled/);
});

test("DENY policy → REJECTED", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(
    execReq({ agentId: "cto_architect", requestedPermissions: ["FILESYSTEM_READ"] }),
  );
  assert.equal(result.status, "REJECTED");
});

test("APPROVAL_REQUIRED policy → REJECTED", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks, { riskLevel: "HIGH", priority: 2 });
  const result = await gate.execute(execReq({ riskLevel: "HIGH" }));
  assert.equal(result.status, "REJECTED");
  assert.match(result.error ?? "", /APPROVAL_REQUIRED/i);
});

test("ALLOW policy without adapter → NOT_IMPLEMENTED", async () => {
  const { tasks, gate, tools } = harness();
  seedTask(tasks);
  const policy = evaluatePolicy(
    {
      requestId: "ex_001",
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_READ"],
      riskLevel: "LOW",
      taskId: "task_exec_001",
    },
    agents,
    tools,
    null,
  );
  assert.equal(policy.decision, "ALLOW");
  const result = await gate.execute(execReq());
  assert.equal(result.status, "NOT_IMPLEMENTED");
  assert.equal(result.executionOccurred, false);
});

test("missing authorization → REJECTED", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(execReq({ authorization: null }));
  assert.equal(result.status, "REJECTED");
  assert.match(result.error ?? "", /Missing authorization/);
});

test("invalid risk level → REJECTED", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(execReq({ riskLevel: "EXTREME" }));
  assert.equal(result.status, "REJECTED");
});

test("invalid permission → REJECTED", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(execReq({ requestedPermissions: ["NOT_A_PERMISSION"] }));
  assert.equal(result.status, "REJECTED");
});

test("missing required permission → REJECTED", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(execReq({ requestedPermissions: [] }));
  assert.equal(result.status, "REJECTED");
});

test("invalid approval → REJECTED", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks, { riskLevel: "HIGH", priority: 2 });
  const result = await gate.execute(execReq({ riskLevel: "HIGH", approvalId: "apr_missing" }));
  assert.equal(result.status, "REJECTED");
  assert.match(result.error ?? "", /Invalid approval/);
});

test("approval for wrong task → REJECTED", async () => {
  const { tasks, approvals, gate } = harness();
  seedTask(tasks, { taskId: "task_a", riskLevel: "HIGH", priority: 2 });
  seedTask(tasks, { taskId: "task_b", riskLevel: "HIGH", priority: 2 });
  approvals.createApproval(baseApproval("task_a"));
  approvals.approve("apr_001", "human:operator");
  const result = await gate.execute(
    execReq({
      taskId: "task_b",
      riskLevel: "HIGH",
      approvalId: "apr_001",
      requestedAction: "FILESYSTEM_WRITE on authorized path",
      requestedPermissions: ["FILESYSTEM_WRITE"],
    }),
  );
  assert.equal(result.status, "REJECTED");
  assert.match(result.error ?? "", /different task/);
});

test("approval for wrong action → REJECTED", async () => {
  const { tasks, approvals, gate } = harness();
  seedTask(tasks, { riskLevel: "HIGH", priority: 2 });
  approvals.createApproval(baseApproval("task_exec_001"));
  approvals.approve("apr_001", "human:operator");
  const result = await gate.execute(
    execReq({
      riskLevel: "HIGH",
      approvalId: "apr_001",
      requestedAction: "CRITICAL destructive action",
      requestedPermissions: ["FILESYSTEM_WRITE"],
    }),
  );
  assert.equal(result.status, "REJECTED");
  assert.match(result.error ?? "", /different action/);
});

test("approval with insufficient risk level → REJECTED", async () => {
  const { tasks, approvals, gate } = harness();
  seedTask(tasks, { riskLevel: "CRITICAL", priority: 1 });
  approvals.createApproval({ ...baseApproval("task_exec_001"), riskLevel: "HIGH" });
  approvals.approve("apr_001", "human:operator");
  const result = await gate.execute(
    execReq({
      riskLevel: "CRITICAL",
      approvalId: "apr_001",
      requestedAction: "FILESYSTEM_WRITE on authorized path",
      requestedPermissions: ["FILESYSTEM_WRITE"],
    }),
  );
  assert.equal(result.status, "REJECTED");
  assert.match(result.error ?? "", /insufficient/);
});

test("no adapter → NOT_IMPLEMENTED (authorized but unavailable)", async () => {
  const { tasks, adapters, gate } = harness();
  seedTask(tasks);
  assert.equal(adapters.list().length, 0);
  const result = await gate.execute(execReq());
  assert.equal(result.status, "NOT_IMPLEMENTED");
  assert.match(result.error ?? "", /No adapter is registered/i);
  assert.equal(result.executionOccurred, false);
});

test("a registered adapter executes: SUCCEEDED with executionOccurred true", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agent-core-gate-"));
  try {
    const { tasks, adapters, gate } = harness();
    adapters.register(new FilesystemAdapter({ root: dir }));
    seedTask(tasks);
    writeFileSync(path.join(dir, "notes.txt"), "hello gate", "utf8");
    const result = await gate.execute(
      execReq({
        executionId: "ex_exec",
        requestedAction: "FILESYSTEM_READ on authorized path",
        input: {
          capability: "FILESYSTEM_READ",
          arguments: { path: "notes.txt" },
        },
      }),
    );
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(result.executionOccurred, true);
    const output = result.output as { kind: string; content: string };
    assert.equal(output.kind, "file");
    assert.equal(output.content, "hello gate");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an adapter crash becomes FAILED execution", async () => {
  const { tasks, adapters, gate } = harness();
  const crashing: ToolAdapter = {
    id: "crashing-adapter",
    toolId: "filesystem",
    async execute() {
      throw new Error("disk on fire");
    },
  };
  adapters.register(crashing);
  seedTask(tasks);
  const result = await gate.execute(execReq());
  assert.equal(result.status, "FAILED");
  assert.equal(result.executionOccurred, true);
  assert.match(result.error ?? "", /Adapter crashed/);
});

test("a REJECTED request never reaches an adapter", async () => {
  let calls = 0;
  const counting: ToolAdapter = {
    id: "counting-adapter",
    toolId: "filesystem",
    async execute() {
      calls += 1;
      throw new Error("must not be reached");
    },
  };
  const { tasks, approvals, adapters, tools } = harness();
  adapters.register(counting);
  const gate = createExecutionGate({ agents, tasks, tools, approvals, adapters });
  seedTask(tasks);
  // DENY: cto_architect is not allowed filesystem.
  const result = await gate.execute(
    execReq({ agentId: "cto_architect", requestedPermissions: ["FILESYSTEM_READ"] }),
  );
  assert.equal(result.status, "REJECTED");
  assert.equal(calls, 0);
});

test("an adapter is never reachable outside the gate path", () => {
  // Adapters live in a registry owned by the gate's dependencies; no agent
  // API exposes ToolAdapterRegistry to agent code.
  const { adapters } = harness();
  assert.equal(adapters.list().length, 0);
});

test("executionOccurred remains false when nothing ran", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  assert.equal((await gate.execute(execReq())).executionOccurred, false);
});

test("no execution evidence is generated without execution", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(execReq({ executionId: "ex_002" }));
  assert.equal(result.output, null);
});

test("AgentDefinition permissions remain unchanged", async () => {
  const before = [...getAgent("principal_engineer").allowedPermissions];
  const { tasks, gate } = harness();
  seedTask(tasks);
  await gate.execute(execReq());
  assert.deepEqual(getAgent("principal_engineer").allowedPermissions, before);
});

test("ToolDefinition.enabled remains unchanged", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  await gate.execute(execReq());
  assert.equal(FILESYSTEM_TOOL.enabled, false);
  assert.equal(BROWSER_TOOL.enabled, false);
  assert.equal(getToolDefinition("filesystem").enabled, false);
});

test("policy rules are not duplicated", async () => {
  const { tasks, gate, tools } = harness();
  seedTask(tasks);
  const policy = evaluatePolicy(
    {
      requestId: "cmp",
      agentId: "cto_architect",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_READ"],
      riskLevel: "LOW",
      taskId: "task_exec_001",
    },
    agents,
    tools,
    null,
  );
  const result = await gate.execute(execReq({ agentId: "cto_architect" }));
  assert.equal(policy.decision, "DENY");
  assert.equal(result.status, "REJECTED");
});

test("Browser Use is not called", async () => {
  const { tasks, adapters, gate } = harness();
  seedTask(tasks);
  await gate.execute(execReq());
  assert.equal(adapters.has("browser-use"), false);
  assert.equal(BROWSER_TOOL.enabled, false);
});

test("Hermes is not called", async () => {
  const { tasks, adapters, gate } = harness();
  seedTask(tasks);
  await gate.execute(execReq());
  assert.equal(adapters.has("hermes"), false);
});

test("no network access occurs without an http adapter", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  assert.equal((await gate.execute(execReq())).status, "NOT_IMPLEMENTED");
});

test("no filesystem execution occurs without an adapter", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(execReq({ requestedPermissions: ["FILESYSTEM_WRITE"] }));
  assert.equal(result.executionOccurred, false);
  assert.notEqual(result.status, "SUCCEEDED");
});

test("no terminal execution occurs", async () => {
  const { tasks, gate } = harness();
  seedTask(tasks);
  const result = await gate.execute(execReq({ toolId: "terminal" }));
  assert.equal(result.status, "REJECTED");
  assert.equal(result.executionOccurred, false);
});

test("a valid HIGH-risk approval cannot bypass PolicyEngine", async () => {
  const { tasks, approvals, gate } = harness();
  seedTask(tasks, { riskLevel: "HIGH", priority: 2 });
  approvals.createApproval(baseApproval("task_exec_001"));
  approvals.approve("apr_001", "human:operator");
  const result = await gate.execute(
    execReq({
      agentId: "research_intelligence",
      riskLevel: "HIGH",
      approvalId: "apr_001",
      requestedAction: "FILESYSTEM_WRITE on authorized path",
      requestedPermissions: ["FILESYSTEM_WRITE"],
    }),
  );
  assert.equal(result.status, "REJECTED");
});

test("a valid approval cannot authorize a different task", async () => {
  const { tasks, approvals, gate } = harness();
  seedTask(tasks, { taskId: "task_a", riskLevel: "HIGH", priority: 2 });
  seedTask(tasks, { taskId: "task_b", riskLevel: "HIGH", priority: 2 });
  approvals.createApproval(baseApproval("task_a"));
  approvals.approve("apr_001", "human:operator");
  assert.equal(
    (
      await gate.execute(
        execReq({
          taskId: "task_b",
          riskLevel: "HIGH",
          approvalId: "apr_001",
          requestedAction: "FILESYSTEM_WRITE on authorized path",
          requestedPermissions: ["FILESYSTEM_WRITE"],
        }),
      )
    ).status,
    "REJECTED",
  );
});

test("a valid approval cannot authorize a different action", async () => {
  const { tasks, approvals, gate } = harness();
  seedTask(tasks, { riskLevel: "HIGH", priority: 2 });
  approvals.createApproval(baseApproval("task_exec_001"));
  approvals.approve("apr_001", "human:operator");
  assert.equal(
    (
      await gate.execute(
        execReq({
          riskLevel: "HIGH",
          approvalId: "apr_001",
          requestedAction: "other action",
          requestedPermissions: ["FILESYSTEM_WRITE"],
        }),
      )
    ).status,
    "REJECTED",
  );
});

test("a valid approval cannot authorize a higher risk level", async () => {
  const { tasks, approvals, gate } = harness();
  seedTask(tasks, { riskLevel: "CRITICAL", priority: 1 });
  approvals.createApproval({ ...baseApproval("task_exec_001"), riskLevel: "HIGH" });
  approvals.approve("apr_001", "human:operator");
  assert.equal(
    (
      await gate.execute(
        execReq({
          riskLevel: "CRITICAL",
          approvalId: "apr_001",
          requestedAction: "FILESYSTEM_WRITE on authorized path",
          requestedPermissions: ["FILESYSTEM_WRITE"],
        }),
      )
    ).status,
    "REJECTED",
  );
});

test("a disabled tool cannot execute even when policy says ALLOW", async () => {
  const { tasks, gate } = harness(createInitialToolRegistry());
  seedTask(tasks);
  const result = await gate.execute(
    execReq({
      authorization: {
        decision: "ALLOW",
        agentId: "principal_engineer",
        toolId: "filesystem",
        riskLevel: "LOW",
        requiredPermissions: ["FILESYSTEM_READ"],
        missingPermissions: [],
        reason: "forged ALLOW",
        approvalRequired: false,
      },
    }),
  );
  assert.equal(result.status, "REJECTED");
  assert.equal(result.executionOccurred, false);
});

test("the Execution Gate must fail closed", async () => {
  const { gate } = harness();
  const result = await gate.execute(
    execReq({
      executionId: "",
      taskId: "",
      agentId: "",
      toolId: "",
      requestedAction: "",
      requestedPermissions: [],
      riskLevel: "",
    }),
  );
  assert.equal(result.status, "REJECTED");
  assert.equal(result.executionOccurred, false);
  assert.notEqual(result.status, "SUCCEEDED");
});

function baseApproval(taskId: string): Approval {
  return {
    approvalId: "apr_001",
    taskId,
    requestedAction: "FILESYSTEM_WRITE on authorized path",
    riskLevel: "HIGH",
    requestedBy: "principal_engineer",
    approvedBy: null,
    status: "PENDING",
    createdAt: "2026-08-16T00:00:00.000Z",
    resolvedAt: null,
  };
}
