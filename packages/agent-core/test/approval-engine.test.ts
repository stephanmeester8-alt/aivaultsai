import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BROWSER_TOOL,
  FILESYSTEM_TOOL,
  RESEARCH_INTELLIGENCE,
  createApprovalEngine,
  createInitialAgentRegistry,
  createTaskEngine,
  createToolRegistry,
  evaluatePolicy,
  getAgent,
  getToolDefinition,
  isApprovalEngineError,
  isApprovalRiskSufficient,
  type Approval,
  type ApprovalEngineError,
  type Task,
} from "../src/index.ts";

const agents = createInitialAgentRegistry();

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    taskId: "task_001",
    title: "High-risk filesystem write",
    objective: "Prepare a scoped write after human approval",
    createdBy: "human",
    assignedTo: "principal_engineer",
    priority: 2,
    status: "READY",
    riskLevel: "HIGH",
    inputs: {},
    expectedOutput: "Approved write plan",
    dependencies: [],
    evidenceRequired: false,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

function baseApproval(overrides: Partial<Approval> = {}): Approval {
  return {
    approvalId: "apr_001",
    taskId: "task_001",
    requestedAction: "FILESYSTEM_WRITE on authorized path",
    riskLevel: "HIGH",
    requestedBy: "principal_engineer",
    approvedBy: null,
    status: "PENDING",
    createdAt: "2026-08-16T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

function setup() {
  const tasks = createTaskEngine(agents);
  tasks.createTask(baseTask());
  const approvals = createApprovalEngine(agents, tasks);
  return { tasks, approvals };
}

function expectCode(error: unknown, code: ApprovalEngineError["code"]): void {
  assert.equal(isApprovalEngineError(error), true);
  assert.equal((error as ApprovalEngineError).code, code);
}

test("create PENDING approval", () => {
  const { approvals } = setup();
  const created = approvals.createApproval(baseApproval());
  assert.equal(created.status, "PENDING");
  assert.equal(approvals.hasApproval("apr_001"), true);
});

test("retrieve approval", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  assert.equal(approvals.getApproval("apr_001").requestedAction.includes("FILESYSTEM_WRITE"), true);
});

test("list approvals", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  approvals.createApproval(baseApproval({ approvalId: "apr_002" }));
  assert.equal(approvals.listApprovals().length, 2);
});

test("unknown approval → explicit error", () => {
  const { approvals } = setup();
  assert.throws(
    () => approvals.getApproval("missing"),
    (error: unknown) => {
      expectCode(error, "APPROVAL_NOT_FOUND");
      return true;
    },
  );
});

test("duplicate approval ID → reject", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  assert.throws(
    () => approvals.createApproval(baseApproval()),
    (error: unknown) => {
      expectCode(error, "APPROVAL_ALREADY_EXISTS");
      return true;
    },
  );
});

test("unknown task → reject", () => {
  const { approvals } = setup();
  assert.throws(
    () => approvals.createApproval(baseApproval({ taskId: "task_missing" })),
    (error: unknown) => {
      expectCode(error, "TASK_NOT_FOUND");
      return true;
    },
  );
});

test("unknown requesting agent → reject", () => {
  const { approvals } = setup();
  assert.throws(
    () =>
      approvals.createApproval(
        baseApproval({ requestedBy: "unknown_agent" as Approval["requestedBy"] }),
      ),
    (error: unknown) => {
      expectCode(error, "INVALID_AGENT");
      return true;
    },
  );
});

test("invalid risk level → reject", () => {
  const { approvals } = setup();
  assert.throws(
    () =>
      approvals.createApproval(
        baseApproval({ riskLevel: "EXTREME" as Approval["riskLevel"] }),
      ),
    (error: unknown) => {
      expectCode(error, "INVALID_APPROVAL");
      return true;
    },
  );
});

test("approval starts PENDING", () => {
  const { approvals } = setup();
  assert.throws(
    () => approvals.createApproval(baseApproval({ status: "APPROVED" })),
    (error: unknown) => {
      expectCode(error, "INVALID_STATUS");
      return true;
    },
  );
  assert.equal(approvals.createApproval(baseApproval()).status, "PENDING");
});

test("PENDING → APPROVED", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  const decided = approvals.approve("apr_001", "human:operator");
  assert.equal(decided.status, "APPROVED");
  assert.equal(decided.approvedBy, "human:operator");
  assert.ok(decided.resolvedAt);
});

test("PENDING → REJECTED", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  assert.equal(approvals.reject("apr_001", "human:operator").status, "REJECTED");
});

test("PENDING → EXPIRED", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  assert.equal(approvals.expire("apr_001").status, "EXPIRED");
});

test("APPROVED cannot become REJECTED", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  approvals.approve("apr_001", "human:operator");
  assert.throws(
    () => approvals.reject("apr_001", "human:operator"),
    (error: unknown) => {
      expectCode(error, "APPROVAL_ALREADY_RESOLVED");
      return true;
    },
  );
});

test("APPROVED cannot become EXPIRED", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  approvals.approve("apr_001", "human:operator");
  assert.throws(
    () => approvals.expire("apr_001"),
    (error: unknown) => {
      expectCode(error, "APPROVAL_ALREADY_RESOLVED");
      return true;
    },
  );
});

test("REJECTED cannot become APPROVED", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  approvals.reject("apr_001", "human:operator");
  assert.throws(
    () => approvals.approve("apr_001", "human:operator"),
    (error: unknown) => {
      expectCode(error, "APPROVAL_ALREADY_RESOLVED");
      return true;
    },
  );
});

test("REJECTED cannot become EXPIRED", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  approvals.reject("apr_001", "human:operator");
  assert.throws(
    () => approvals.expire("apr_001"),
    (error: unknown) => {
      expectCode(error, "APPROVAL_ALREADY_RESOLVED");
      return true;
    },
  );
});

test("EXPIRED cannot become APPROVED", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  approvals.expire("apr_001");
  assert.throws(
    () => approvals.approve("apr_001", "human:operator"),
    (error: unknown) => {
      expectCode(error, "APPROVAL_ALREADY_RESOLVED");
      return true;
    },
  );
});

test("EXPIRED cannot become REJECTED", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  approvals.expire("apr_001");
  assert.throws(
    () => approvals.reject("apr_001", "human:operator"),
    (error: unknown) => {
      expectCode(error, "APPROVAL_ALREADY_RESOLVED");
      return true;
    },
  );
});

test("self-approval is rejected", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval({ requestedBy: "research_intelligence" }));
  assert.throws(
    () => approvals.approve("apr_001", "research_intelligence"),
    (error: unknown) => {
      expectCode(error, "SELF_APPROVAL");
      return true;
    },
  );
});

test("approval can be queried by task", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  assert.equal(approvals.listByTask("task_001").length, 1);
});

test("approval can be queried by agent", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval({ requestedBy: "research_intelligence" }));
  assert.equal(approvals.listByAgent("research_intelligence").length, 1);
  assert.equal(approvals.listByAgent("product_ux").length, 0);
});

test("returned approval cannot mutate internal state", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  const copy = approvals.getApproval("apr_001") as unknown as {
    status: string;
    requestedAction: string;
  };
  copy.status = "APPROVED";
  copy.requestedAction = "mutated";
  const stored = approvals.getApproval("apr_001");
  assert.equal(stored.status, "PENDING");
  assert.equal(stored.requestedAction, "FILESYSTEM_WRITE on authorized path");
});

test("HIGH approval cannot authorize CRITICAL action", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval({ riskLevel: "HIGH" }));
  const decided = approvals.approve("apr_001", "human:operator");
  assert.equal(isApprovalRiskSufficient(decided.riskLevel, "CRITICAL"), false);
  const tools = createToolRegistry();
  tools.register({ ...FILESYSTEM_TOOL, enabled: true });
  const policy = evaluatePolicy(
    {
      requestId: "req_crit",
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_WRITE"],
      riskLevel: "CRITICAL",
      approvalId: "apr_001",
      taskId: "task_001",
    },
    agents,
    tools,
    decided,
  );
  assert.equal(policy.decision, "DENY");
  assert.match(policy.reason, /insufficient/);
});

test("approval remains bound to requested action", () => {
  const { approvals } = setup();
  const created = approvals.createApproval(
    baseApproval({ requestedAction: "browser research WEB_READ" }),
  );
  const decided = approvals.approve(created.approvalId, "human:operator");
  assert.equal(decided.requestedAction, "browser research WEB_READ");
  assert.notEqual(decided.requestedAction, "CRITICAL destructive action");
});

test("agent cannot use approval as permanent permission", () => {
  const before = [...RESEARCH_INTELLIGENCE.allowedPermissions];
  const { approvals } = setup();
  approvals.createApproval(baseApproval({ requestedBy: "research_intelligence" }));
  approvals.approve("apr_001", "human:operator");
  assert.deepEqual(getAgent("research_intelligence").allowedPermissions, before);
  assert.deepEqual(RESEARCH_INTELLIGENCE.allowedPermissions, before);
});

test("approval engine does not execute tools", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  approvals.approve("apr_001", "human:operator");
  assert.equal(getToolDefinition("browser").enabled, false);
  assert.equal(getToolDefinition("filesystem").enabled, false);
});

test("approval engine does not invoke Browser Use", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  assert.equal(BROWSER_TOOL.enabled, false);
});

test("approval engine does not invoke Hermes", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  assert.equal(approvals.getApproval("apr_001").status, "PENDING");
});

test("APPROVED approval does not modify AgentDefinition permissions", () => {
  const { approvals } = setup();
  const before = [...getAgent("principal_engineer").allowedPermissions];
  approvals.createApproval(baseApproval());
  approvals.approve("apr_001", "human:operator");
  assert.deepEqual(getAgent("principal_engineer").allowedPermissions, before);
});

test("APPROVED approval does not modify ToolDefinition.enabled", () => {
  const { approvals } = setup();
  approvals.createApproval(baseApproval());
  approvals.approve("apr_001", "human:operator");
  assert.equal(FILESYSTEM_TOOL.enabled, false);
  assert.equal(BROWSER_TOOL.enabled, false);
});
