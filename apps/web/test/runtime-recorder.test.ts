import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PostgresRunRecorder,
  type RuntimeSql,
} from "../lib/runtime/postgres-run-recorder.ts";

function fakeSql(): { sql: RuntimeSql; inserts: string[] } {
  const inserts: string[] = [];
  const sql: RuntimeSql = async (strings, ...values) => {
    inserts.push(strings[0]!.split("(")[0]!.trim());
    void values;
    return [];
  };
  return { sql, inserts };
}

test("records a run state transition into agent_runs", async () => {
  const { sql, inserts } = fakeSql();
  const recorder = new PostgresRunRecorder(sql);
  await recorder.record({
    runId: "run_1",
    state: "COMPLETED",
    taskId: "task_run_1",
    agentId: "principal_engineer",
    toolId: "filesystem",
    timestamp: "2026-08-16T00:00:00.000Z",
  });
  assert.equal(inserts.length, 1);
  assert.match(inserts[0]!, /INSERT INTO agent_runs/);
});

test("records task, execution, evidence, approval and handoff artifacts", async () => {
  const { sql, inserts } = fakeSql();
  const recorder = new PostgresRunRecorder(sql);
  await recorder.record({ runId: "r", state: "PLANNED", taskId: "t", agentId: null, toolId: null, timestamp: "", kind: "task", data: { taskId: "t", objective: "o", status: "READY", priority: 3, riskLevel: "LOW", assignedTo: "a" } });
  await recorder.record({ runId: "r", state: "EXECUTING", taskId: "t", agentId: "a", toolId: "fs", timestamp: "", kind: "execution", data: { executionId: "ex", status: "SUCCEEDED", executionOccurred: true, error: null, inputHash: "h1", outputHash: "h2" } });
  await recorder.record({ runId: "r", state: "COMPLETED", taskId: "t", agentId: "a", toolId: null, timestamp: "", kind: "evidence", data: { evidenceId: "ev", claim: "tool ran", type: "FACT", confidence: "HIGH" } });
  await recorder.record({ runId: "r", state: "APPROVED", taskId: "t", agentId: "a", toolId: null, timestamp: "", kind: "approval", data: { approvalId: "apr", decision: "APPROVED", approver: "human:op" } });
  await recorder.record({ runId: "r", state: "HANDED_OFF", taskId: "t", agentId: "a", toolId: null, timestamp: "", kind: "handoff", data: { handoffId: "ho", fromAgent: "a", toAgent: "b" } });
  const tables = inserts.join(" ");
  assert.match(tables, /INSERT INTO runtime_tasks/);
  assert.match(tables, /INSERT INTO runtime_executions/);
  assert.match(tables, /INSERT INTO runtime_evidence/);
  assert.match(tables, /INSERT INTO runtime_approvals/);
  assert.match(tables, /INSERT INTO runtime_handoffs/);
});

test("a failed write is swallowed (recorder never breaks the run)", async () => {
  const throwing: RuntimeSql = async () => {
    throw new Error("database unavailable");
  };
  const recorder = new PostgresRunRecorder(throwing);
  await recorder.record({ runId: "r", state: "RECEIVED", taskId: null, agentId: null, toolId: null, timestamp: "" });
  assert.ok(true);
});
