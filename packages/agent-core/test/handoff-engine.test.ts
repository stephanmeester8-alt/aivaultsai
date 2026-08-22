import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BROWSER_TOOL,
  CTO_ARCHITECT,
  PRODUCT_UX,
  RESEARCH_INTELLIGENCE,
  createAgentRegistry,
  createHandoffEngine,
  createInitialAgentRegistry,
  createInitialToolRegistry,
  createTaskEngine,
  evaluatePolicy,
  getToolDefinition,
  isHandoffEngineError,
  type Handoff,
  type HandoffEngineError,
  type Task,
} from "../src/index.ts";

const agents = createInitialAgentRegistry();

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    taskId: "task_001",
    title: "Research competitor claims",
    objective: "Verify public claims before product work",
    createdBy: "human",
    assignedTo: "research_intelligence",
    priority: 3,
    status: "READY",
    riskLevel: "LOW",
    inputs: {},
    expectedOutput: "Handoff-ready findings",
    dependencies: [],
    evidenceRequired: true,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

function baseHandoff(overrides: Partial<Handoff> = {}): Handoff {
  return {
    handoffId: "handoff_001",
    fromAgent: "research_intelligence",
    toAgent: "product_ux",
    taskId: "task_001",
    objective: "Turn verified findings into product requirements",
    completedWork: "Collected public sources and labeled claims",
    findings: ["Vendor pricing pages are incomplete"],
    decisions: ["Treat vendor claims as COMPANY_CLAIM"],
    evidenceIds: ["ev_001"],
    risks: ["Sources may be stale"],
    openQuestions: ["Is the listed plan still sold?"],
    recommendedNextAction: "Draft ICP constraints from verified claims only",
    createdAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

function setup(taskOverrides: Partial<Task> = {}) {
  const tasks = createTaskEngine(agents);
  tasks.createTask(baseTask(taskOverrides));
  const handoffs = createHandoffEngine(agents, tasks);
  return { tasks, handoffs };
}

function expectCode(error: unknown, code: HandoffEngineError["code"]): void {
  assert.equal(isHandoffEngineError(error), true);
  assert.equal((error as HandoffEngineError).code, code);
}

test("create valid handoff", () => {
  const { handoffs } = setup();
  const created = handoffs.createHandoff(baseHandoff());
  assert.equal(created.handoffId, "handoff_001");
  assert.equal(handoffs.hasHandoff("handoff_001"), true);
});

test("retrieve handoff", () => {
  const { handoffs } = setup();
  handoffs.createHandoff(baseHandoff());
  assert.equal(handoffs.getHandoff("handoff_001").toAgent, "product_ux");
});

test("list handoffs", () => {
  const { handoffs } = setup();
  handoffs.createHandoff(baseHandoff());
  handoffs.createHandoff(baseHandoff({ handoffId: "handoff_002", toAgent: "cto_architect" }));
  assert.equal(handoffs.listHandoffs().length, 2);
});

test("unknown handoff → explicit error", () => {
  const { handoffs } = setup();
  assert.throws(
    () => handoffs.getHandoff("missing"),
    (error: unknown) => {
      expectCode(error, "HANDOFF_NOT_FOUND");
      return true;
    },
  );
});

test("duplicate handoff ID → reject", () => {
  const { handoffs } = setup();
  handoffs.createHandoff(baseHandoff());
  assert.throws(
    () => handoffs.createHandoff(baseHandoff()),
    (error: unknown) => {
      expectCode(error, "HANDOFF_ALREADY_EXISTS");
      return true;
    },
  );
});

test("unknown source agent → reject", () => {
  const { handoffs } = setup();
  assert.throws(
    () =>
      handoffs.createHandoff(
        baseHandoff({ fromAgent: "unknown_agent" as Handoff["fromAgent"] }),
      ),
    (error: unknown) => {
      expectCode(error, "INVALID_AGENT");
      return true;
    },
  );
});

test("unknown target agent → reject", () => {
  const { handoffs } = setup();
  assert.throws(
    () =>
      handoffs.createHandoff(
        baseHandoff({ toAgent: "unknown_agent" as Handoff["toAgent"] }),
      ),
    (error: unknown) => {
      expectCode(error, "INVALID_AGENT");
      return true;
    },
  );
});

test("self-handoff → reject", () => {
  const { handoffs } = setup();
  assert.throws(
    () =>
      handoffs.createHandoff(
        baseHandoff({ fromAgent: "product_ux", toAgent: "product_ux" }),
      ),
    (error: unknown) => {
      expectCode(error, "SELF_HANDOFF");
      return true;
    },
  );
});

test("unknown task → reject", () => {
  const { handoffs } = setup();
  assert.throws(
    () => handoffs.createHandoff(baseHandoff({ taskId: "task_missing" })),
    (error: unknown) => {
      expectCode(error, "TASK_NOT_FOUND");
      return true;
    },
  );
});

test("empty objective → reject", () => {
  const { handoffs } = setup();
  assert.throws(
    () => handoffs.createHandoff(baseHandoff({ objective: "  " })),
    (error: unknown) => {
      expectCode(error, "INVALID_HANDOFF");
      return true;
    },
  );
});

test("missing completed work → reject", () => {
  const { handoffs } = setup();
  assert.throws(
    () => handoffs.createHandoff(baseHandoff({ completedWork: "" })),
    (error: unknown) => {
      expectCode(error, "INVALID_HANDOFF");
      return true;
    },
  );
});

test("missing findings → reject", () => {
  const { handoffs } = setup();
  assert.throws(
    () => handoffs.createHandoff(baseHandoff({ findings: [] })),
    (error: unknown) => {
      expectCode(error, "INVALID_HANDOFF");
      return true;
    },
  );
});

test("missing recommended next action → reject", () => {
  const { handoffs } = setup();
  assert.throws(
    () => handoffs.createHandoff(baseHandoff({ recommendedNextAction: "" })),
    (error: unknown) => {
      expectCode(error, "INVALID_HANDOFF");
      return true;
    },
  );
});

test("target not in handoffTargets → reject", () => {
  const registry = createAgentRegistry();
  registry.register({
    ...RESEARCH_INTELLIGENCE,
    handoffTargets: ["product_ux"],
  });
  registry.register(PRODUCT_UX);
  registry.register(CTO_ARCHITECT);
  const tasks = createTaskEngine(registry);
  tasks.createTask(baseTask());
  const handoffs = createHandoffEngine(registry, tasks);
  assert.throws(
    () =>
      handoffs.createHandoff(
        baseHandoff({ fromAgent: "research_intelligence", toAgent: "cto_architect" }),
      ),
    (error: unknown) => {
      expectCode(error, "INVALID_HANDOFF_TARGET");
      return true;
    },
  );
  assert.deepEqual(RESEARCH_INTELLIGENCE.handoffTargets, [
    "cto_architect",
    "product_ux",
    "principal_engineer",
    "growth_analytics",
  ]);
});

test("valid Research → Product handoff", () => {
  const { handoffs } = setup();
  const created = handoffs.createHandoff(baseHandoff());
  assert.equal(created.fromAgent, "research_intelligence");
  assert.equal(created.toAgent, "product_ux");
});

test("valid Research → CTO handoff", () => {
  const { handoffs } = setup();
  const created = handoffs.createHandoff(
    baseHandoff({ toAgent: "cto_architect", objective: "Escalate architecture risk" }),
  );
  assert.equal(created.toAgent, "cto_architect");
});

test("valid Product → Engineering handoff if defined", () => {
  assert.ok(PRODUCT_UX.handoffTargets.includes("principal_engineer"));
  const { handoffs } = setup();
  const created = handoffs.createHandoff(
    baseHandoff({
      fromAgent: "product_ux",
      toAgent: "principal_engineer",
      objective: "Implement approved requirements",
    }),
  );
  assert.equal(created.toAgent, "principal_engineer");
});

test("handoff does not change task status", () => {
  const { tasks, handoffs } = setup();
  tasks.transitionTask("task_001", "IN_PROGRESS");
  assert.equal(tasks.getTask("task_001").status, "IN_PROGRESS");
  handoffs.createHandoff(baseHandoff());
  assert.equal(tasks.getTask("task_001").status, "IN_PROGRESS");
});

test("handoff does not invoke Policy Engine", () => {
  const { handoffs } = setup();
  handoffs.createHandoff(baseHandoff());
  const policy = evaluatePolicy(
    {
      requestId: "req_handoff",
      agentId: "research_intelligence",
      toolId: "browser",
      requestedPermissions: ["WEB_READ"],
      riskLevel: "LOW",
    },
    agents,
    createInitialToolRegistry(),
    null,
  );
  assert.equal(policy.decision, "DENY");
  assert.equal(handoffs.hasHandoff("handoff_001"), true);
});

test("handoff does not execute tools", () => {
  const { handoffs } = setup();
  handoffs.createHandoff(baseHandoff());
  assert.equal(getToolDefinition("browser").enabled, false);
  assert.equal(BROWSER_TOOL.enabled, false);
});

test("returned handoff cannot mutate internal state", () => {
  const { handoffs } = setup();
  handoffs.createHandoff(baseHandoff());
  const copy = handoffs.getHandoff("handoff_001") as unknown as {
    objective: string;
    findings: string[];
    evidenceIds: string[];
  };
  copy.objective = "mutated";
  copy.findings.push("injected");
  copy.evidenceIds.splice(0, 1);
  const stored = handoffs.getHandoff("handoff_001");
  assert.equal(stored.objective, "Turn verified findings into product requirements");
  assert.deepEqual(stored.findings, ["Vendor pricing pages are incomplete"]);
  assert.deepEqual(stored.evidenceIds, ["ev_001"]);
});

test("evidence IDs can be referenced", () => {
  const { handoffs } = setup();
  const created = handoffs.createHandoff(
    baseHandoff({ evidenceIds: ["ev_001", "ev_002"] }),
  );
  assert.deepEqual(created.evidenceIds, ["ev_001", "ev_002"]);
});

test("multiple handoffs can reference the same task", () => {
  const { handoffs } = setup();
  handoffs.createHandoff(baseHandoff({ handoffId: "handoff_a", toAgent: "product_ux" }));
  handoffs.createHandoff(baseHandoff({ handoffId: "handoff_b", toAgent: "cto_architect" }));
  const forTask = handoffs.listHandoffs().filter((item) => item.taskId === "task_001");
  assert.equal(forTask.length, 2);
});
