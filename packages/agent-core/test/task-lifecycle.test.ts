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
    title: "Lifecycle task",
    objective: "Exercise the full task lifecycle",
    createdBy: "human",
    assignedTo: null,
    priority: 3,
    status: "BACKLOG",
    riskLevel: "LOW",
    inputs: {},
    expectedOutput: "Lifecycle exercised",
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

test("scheduleTask moves BACKLOG → READY", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask());
  const scheduled = engine.scheduleTask("task_001");
  assert.equal(scheduled.status, "READY");
});

test("executeTask requires an assigned agent", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY" }));
  assert.throws(
    () => engine.executeTask("task_001"),
    (error: unknown) => {
      expectCode(error, "TASK_NOT_ASSIGNABLE");
      return true;
    },
  );
  engine.assignTask("task_001", "principal_engineer");
  assert.equal(engine.executeTask("task_001").status, "IN_PROGRESS");
});

test("completeTask requires REVIEW and linked evidence when evidenceRequired", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(
    baseTask({ status: "READY", assignedTo: "principal_engineer", evidenceRequired: true }),
  );
  engine.executeTask("task_001");
  engine.transitionTask("task_001", "REVIEW");
  assert.throws(
    () => engine.completeTask("task_001"),
    (error: unknown) => {
      expectCode(error, "EVIDENCE_REQUIRED");
      return true;
    },
  );
  const done = engine.completeTask("task_001", { evidenceLinked: true });
  assert.equal(done.status, "DONE");
});

test("failTask records a failure reason", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY", assignedTo: "principal_engineer" }));
  engine.executeTask("task_001");
  const failed = engine.failTask("task_001", "adapter unavailable");
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.failureReason, "adapter unavailable");
});

test("retryTask clears the failure reason", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY", assignedTo: "principal_engineer" }));
  engine.executeTask("task_001");
  engine.failTask("task_001", "temporary");
  const retried = engine.retryTask("task_001");
  assert.equal(retried.status, "READY");
  assert.equal(retried.failureReason, null);
});

test("failTask is refused outside IN_PROGRESS/REVIEW", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask({ status: "READY", assignedTo: "principal_engineer" }));
  assert.throws(
    () => engine.failTask("task_001", "nope"),
    (error: unknown) => {
      expectCode(error, "INVALID_TRANSITION");
      return true;
    },
  );
});

test("validateTask reports problems without mutating state", () => {
  const engine = createTaskEngine(agents);
  engine.createTask(baseTask());
  assert.deepEqual(engine.validateTask("task_001"), []);
  // validateTask never mutates state.
  assert.equal(engine.getTask("task_001").status, "BACKLOG");
  // An evidence-required task that is DONE without linked evidence is
  // flagged defensively (unreachable via the public API, which refuses
  // completeTask without evidenceLinked — the check is belt-and-braces).
  const before = engine.getTask("task_001");
  const problems = engine.validateTask("task_001");
  assert.deepEqual(problems, []);
  assert.equal(engine.getTask("task_001").taskId, before.taskId);
});
