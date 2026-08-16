import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createInitialAgentRegistry,
  createTaskEngine,
  isTaskEngineError,
  type Task,
  type TaskEngineError,
} from "../src/index.ts";

const agents = createInitialAgentRegistry();

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    taskId: "task_001",
    title: "Draft architecture note",
    objective: "Produce a scoped architecture recommendation",
    createdBy: "human",
    assignedTo: null,
    priority: "MEDIUM",
    status: "BACKLOG",
    riskLevel: "LOW",
    inputs: { topic: "task engine" },
    expectedOutput: "Written note",
    dependencies: [],
    evidenceRequired: false,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

function expectCode(error: unknown, code: TaskEngineError["code"]): void {
  assert.equal(isTaskEngineError(error), true);
  assert.equal((error as TaskEngineError).code, code);
}

test("create task", () => {
  const engine = createTaskEngine(agents);
  const created = engine.createTask(baseTask());
  assert.equal(created.taskId, "task_001");
  assert.equal(created.status, "BACKLOG");
  assert.equal(engine.hasTask("task_001"), true);
});

test("reject duplicate task ID", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask());
  assert.throws(
    () => engine.createTask(baseTask()),
    (error: unknown) => {
      expectCode(error, "TASK_ALREADY_EXISTS");
      return true;
    },
  );
});

test("retrieve task", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask());
  const fetched = engine.getTask("task_001");
  assert.equal(fetched.title, "Draft architecture note");
});

test("unknown task returns explicit error", () => {
  const engine = createTaskEngine(agents);
  assert.throws(
    () => engine.getTask("missing"),
    (error: unknown) => {
      expectCode(error, "TASK_NOT_FOUND");
      return true;
    },
  );
});

test("list tasks", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ taskId: "task_a" }));
  engine.createTask(baseTask({ taskId: "task_b", title: "Second" }));
  assert.equal(engine.listTasks().length, 2);
});

test("assign valid agent", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask());
  const assigned = engine.assignTask("task_001", "cto_architect");
  assert.equal(assigned.assignedTo, "cto_architect");
});

test("reject unknown agent", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask());
  assert.throws(
    () => engine.assignTask("task_001", "unknown_agent"),
    (error: unknown) => {
      expectCode(error, "INVALID_AGENT");
      return true;
    },
  );
});

test("reject reassignment of IN_PROGRESS task", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask());
  engine.assignTask("task_001", "cto_architect");
  engine.transitionTask("task_001", "READY");
  engine.transitionTask("task_001", "IN_PROGRESS");
  assert.throws(
    () => engine.assignTask("task_001", "product_ux"),
    (error: unknown) => {
      expectCode(error, "TASK_NOT_ASSIGNABLE");
      return true;
    },
  );
});

test("reject reassignment of DONE task", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask());
  engine.assignTask("task_001", "cto_architect");
  engine.transitionTask("task_001", "READY");
  engine.transitionTask("task_001", "IN_PROGRESS");
  engine.transitionTask("task_001", "REVIEW");
  engine.transitionTask("task_001", "DONE");
  assert.throws(
    () => engine.assignTask("task_001", "product_ux"),
    (error: unknown) => {
      expectCode(error, "TASK_NOT_ASSIGNABLE");
      return true;
    },
  );
});

test("BACKLOG → READY", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask());
  assert.equal(engine.transitionTask("task_001", "READY").status, "READY");
});

test("READY → IN_PROGRESS", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY" }));
  engine.assignTask("task_001", "principal_engineer");
  assert.equal(engine.transitionTask("task_001", "IN_PROGRESS").status, "IN_PROGRESS");
});

test("IN_PROGRESS → REVIEW", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY", assignedTo: "principal_engineer" }));
  engine.transitionTask("task_001", "IN_PROGRESS");
  assert.equal(engine.transitionTask("task_001", "REVIEW").status, "REVIEW");
});

test("REVIEW → DONE", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY", assignedTo: "principal_engineer" }));
  engine.transitionTask("task_001", "IN_PROGRESS");
  engine.transitionTask("task_001", "REVIEW");
  assert.equal(engine.transitionTask("task_001", "DONE").status, "DONE");
});

test("READY → BLOCKED", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY" }));
  assert.equal(engine.transitionTask("task_001", "BLOCKED").status, "BLOCKED");
});

test("BLOCKED → READY", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY" }));
  engine.transitionTask("task_001", "BLOCKED");
  assert.equal(engine.transitionTask("task_001", "READY").status, "READY");
});

test("IN_PROGRESS → BLOCKED", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY", assignedTo: "research_intelligence" }));
  engine.transitionTask("task_001", "IN_PROGRESS");
  assert.equal(engine.transitionTask("task_001", "BLOCKED").status, "BLOCKED");
});

test("IN_PROGRESS → FAILED", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY", assignedTo: "research_intelligence" }));
  engine.transitionTask("task_001", "IN_PROGRESS");
  assert.equal(engine.transitionTask("task_001", "FAILED").status, "FAILED");
});

test("invalid transition is rejected", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask());
  assert.throws(
    () => engine.transitionTask("task_001", "DONE"),
    (error: unknown) => {
      expectCode(error, "INVALID_TRANSITION");
      return true;
    },
  );
});

test("DONE cannot transition", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY", assignedTo: "cto_architect" }));
  engine.transitionTask("task_001", "IN_PROGRESS");
  engine.transitionTask("task_001", "REVIEW");
  engine.transitionTask("task_001", "DONE");
  assert.throws(
    () => engine.transitionTask("task_001", "READY"),
    (error: unknown) => {
      expectCode(error, "INVALID_TRANSITION");
      return true;
    },
  );
});

test("FAILED cannot transition", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY", assignedTo: "cto_architect" }));
  engine.transitionTask("task_001", "IN_PROGRESS");
  engine.transitionTask("task_001", "FAILED");
  assert.throws(
    () => engine.transitionTask("task_001", "READY"),
    (error: unknown) => {
      expectCode(error, "INVALID_TRANSITION");
      return true;
    },
  );
});

test("invalid task data is rejected", () => {
  const engine = createTaskEngine(agents);
  assert.throws(
    () => engine.createTask(baseTask({ title: "  " })),
    (error: unknown) => {
      expectCode(error, "INVALID_TASK");
      return true;
    },
  );
  assert.throws(
    () => engine.createTask(baseTask({ objective: "" })),
    (error: unknown) => {
      expectCode(error, "INVALID_TASK");
      return true;
    },
  );
  assert.throws(
    () => engine.createTask(baseTask({ createdBy: "not_an_agent" as Task["createdBy"] })),
    (error: unknown) => {
      expectCode(error, "INVALID_TASK");
      return true;
    },
  );
  assert.throws(
    () => engine.createTask(baseTask({ priority: "URGENT" as Task["priority"] })),
    (error: unknown) => {
      expectCode(error, "INVALID_TASK");
      return true;
    },
  );
});

test("internal task state cannot be mutated externally", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ inputs: { topic: "task engine" } }));
  const copy = engine.getTask("task_001");
  copy.title = "mutated";
  (copy.inputs as Record<string, unknown>).topic = "hacked";
  (copy.dependencies as string[]).push("task_other");
  const stored = engine.getTask("task_001");
  assert.equal(stored.title, "Draft architecture note");
  assert.equal(stored.inputs.topic, "task engine");
  assert.deepEqual(stored.dependencies, []);
});
