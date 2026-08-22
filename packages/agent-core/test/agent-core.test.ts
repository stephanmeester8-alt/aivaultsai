import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AGENT_IDS,
  BROWSER_TOOL,
  createAgentRegistry,
  createApproval,
  createHandoff,
  createInitialAgentRegistry,
  createTask,
  getAgent,
  getToolDefinition,
  isDirectlyObserved,
  isValidAgentId,
  isValidRiskLevel,
  isValidTaskStatus,
  PRINCIPAL_ENGINEER,
  RESEARCH_INTELLIGENCE,
  requiresHumanApproval,
  type Evidence,
} from "../src/index.ts";

test("AgentRegistry registers five agents", () => {
  const registry = createInitialAgentRegistry();
  assert.equal(registry.list().length, 5);
});

test("duplicate agent IDs are rejected", () => {
  const registry = createInitialAgentRegistry();
  assert.throws(() => registry.register(RESEARCH_INTELLIGENCE), /Duplicate agent id/);
});

test("unknown agent IDs are rejected", () => {
  const registry = createInitialAgentRegistry();
  assert.equal(isValidAgentId("unknown_agent"), false);
  assert.throws(() => registry.get("unknown_agent"), /Unknown agent id/);
  assert.throws(() => getAgent("unknown_agent"), /Unknown agent id/);
  const empty = createAgentRegistry();
  assert.throws(() => empty.get("cto_architect"), /Unknown agent id/);
});

test("all five required agents exist", () => {
  const registry = createInitialAgentRegistry();
  for (const id of AGENT_IDS) {
    assert.equal(registry.has(id), true);
    assert.equal(getAgent(id).id, id);
  }
});

test("agent definitions have capabilities", () => {
  const registry = createInitialAgentRegistry();
  for (const agent of registry.list()) {
    assert.ok(agent.capabilities.length > 0, `${agent.id} missing capabilities`);
  }
});

test("agent definitions have permission boundaries", () => {
  assert.deepEqual(RESEARCH_INTELLIGENCE.allowedPermissions, [
    "WEB_SEARCH",
    "WEB_READ",
    "WEB_NAVIGATE",
  ]);
  assert.ok(RESEARCH_INTELLIGENCE.prohibitedPermissions.includes("WEB_TYPE"));
  assert.ok(RESEARCH_INTELLIGENCE.prohibitedPermissions.includes("WEB_UPLOAD"));
  assert.ok(RESEARCH_INTELLIGENCE.prohibitedPermissions.includes("TERMINAL_EXECUTE"));

  assert.deepEqual(PRINCIPAL_ENGINEER.allowedPermissions, [
    "FILESYSTEM_READ",
    "FILESYSTEM_WRITE",
    "TERMINAL_EXECUTE",
  ]);

  const growth = getAgent("growth_analytics");
  assert.deepEqual(growth.allowedPermissions, ["WEB_SEARCH", "WEB_READ"]);
  assert.ok(!growth.allowedPermissions.includes("WEB_NAVIGATE"));
});

test("browser tool is disabled", () => {
  assert.equal(BROWSER_TOOL.enabled, false);
  assert.equal(getToolDefinition("browser").enabled, false);
  assert.equal(getToolDefinition("browser").category, "BROWSER");
});

test("task contract can be constructed", () => {
  const task = createTask({
    taskId: "task_001",
    title: "Draft architecture note",
    objective: "Produce a scoped architecture recommendation",
    createdBy: "human",
    assignedTo: "cto_architect",
    priority: 2,
    status: "READY",
    riskLevel: "MEDIUM",
    inputs: { topic: "agent registry" },
    expectedOutput: "Written architecture recommendation",
    dependencies: [],
    evidenceRequired: false,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
  });
  assert.equal(task.assignedTo, "cto_architect");
  assert.equal(isValidTaskStatus(task.status), true);
  assert.equal(isValidRiskLevel(task.riskLevel), true);
});

test("handoff references valid AgentIds", () => {
  const handoff = createHandoff({
    handoffId: "handoff_001",
    fromAgent: "research_intelligence",
    toAgent: "product_ux",
    taskId: "task_001",
    objective: "Turn verified findings into product requirements",
    completedWork: "Collected source list",
    findings: ["Public pricing pages are incomplete"],
    decisions: ["Treat vendor claims as COMPANY_CLAIM"],
    evidenceIds: ["ev_001"],
    risks: ["Sources may be stale"],
    openQuestions: ["Is the competitor still selling the listed plan?"],
    recommendedNextAction: "Draft ICP constraints from verified claims only",
    createdAt: "2026-08-16T00:00:00.000Z",
  });
  assert.equal(isValidAgentId(handoff.fromAgent), true);
  assert.equal(isValidAgentId(handoff.toAgent), true);
  assert.throws(
    () =>
      createHandoff({
        ...handoff,
        fromAgent: "not_an_agent",
      } as unknown as typeof handoff),
    /Invalid fromAgent/,
  );
});

test("evidence supports confidence and epistemic type", () => {
  const fact: Evidence = {
    evidenceId: "ev_001",
    claim: "The repository contains packages/agent-core",
    type: "FACT",
    source: "packages/agent-core/src/index.ts",
    sourceType: "file",
    supportingData: "File exists in workspace",
    counterEvidence: null,
    confidence: "HIGH",
    provenance: {
      actor: "human",
      toolId: null,
      capability: null,
      method: "workspace_inspection",
    },
    collectedAt: "2026-08-16T00:00:00.000Z",
  };
  const inference: Evidence = {
    ...fact,
    evidenceId: "ev_002",
    claim: "Users will adopt the agent registry",
    type: "INFERENCE",
    confidence: "LOW",
    source: "none",
    sourceType: "unknown",
  };
  assert.equal(isDirectlyObserved(fact.type), true);
  assert.equal(isDirectlyObserved(inference.type), false);
  assert.notEqual(fact.type, inference.type);
});

test("approval supports risk classification", () => {
  const approval = createApproval({
    approvalId: "apr_001",
    taskId: "task_001",
    requestedAction: "WEB_UPLOAD of a customer document",
    riskLevel: "CRITICAL",
    requestedBy: "research_intelligence",
    approvedBy: null,
    status: "PENDING",
    createdAt: "2026-08-16T00:00:00.000Z",
    resolvedAt: null,
  });
  assert.equal(requiresHumanApproval(approval.riskLevel), true);
  assert.equal(requiresHumanApproval("LOW"), false);
  assert.equal(isValidAgentId(approval.requestedBy), true);
});
