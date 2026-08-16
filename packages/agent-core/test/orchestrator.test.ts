import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BROWSER_TOOL,
  FILESYSTEM_TOOL,
  RESEARCH_INTELLIGENCE,
  createApprovalEngine,
  createEvidenceStore,
  createHandoffEngine,
  createInitialAgentRegistry,
  createInitialToolRegistry,
  createOrchestrator,
  createTaskEngine,
  createToolRegistry,
  getAgent,
  getToolDefinition,
  isOrchestratorError,
  type Handoff,
  type OrchestrationRequest,
  type OrchestratorError,
} from "../src/index.ts";

const agents = createInitialAgentRegistry();

function enabledFilesystem() {
  const tools = createToolRegistry();
  tools.register({ ...FILESYSTEM_TOOL, enabled: true });
  return tools;
}

function system() {
  const tasks = createTaskEngine(agents);
  const handoffs = createHandoffEngine(agents, tasks);
  const evidence = createEvidenceStore();
  const approvals = createApprovalEngine(agents, tasks);
  const tools = enabledFilesystem();
  const orchestrator = createOrchestrator({
    agents,
    tasks,
    handoffs,
    evidence,
    approvals,
    tools,
  });
  return { tasks, handoffs, evidence, approvals, tools, orchestrator };
}

function request(
  overrides: Partial<OrchestrationRequest> = {},
): OrchestrationRequest {
  return {
    requestId: "req_001",
    objective: "Write a scoped architecture file",
    createdBy: "human",
    assignedAgent: "principal_engineer",
    toolId: "filesystem",
    requestedPermissions: ["FILESYSTEM_READ"],
    riskLevel: "LOW",
    expectedOutput: "Authorized write plan, not executed",
    ...overrides,
  };
}

function expectCode(error: unknown, code: OrchestratorError["code"]): void {
  assert.equal(isOrchestratorError(error), true);
  assert.equal((error as OrchestratorError).code, code);
}

function sampleHandoff(taskId: string, overrides: Partial<Handoff> = {}): Handoff {
  return {
    handoffId: "handoff_orch_001",
    fromAgent: "principal_engineer",
    toAgent: "cto_architect",
    taskId,
    objective: "Review authorized plan",
    completedWork: "Policy ALLOW recorded; no execution",
    findings: ["Authorization only"],
    decisions: ["Stop at READY_FOR_EXECUTION"],
    evidenceIds: [],
    risks: ["Execution is not implemented"],
    openQuestions: ["When will execution be authorized as a later task?"],
    recommendedNextAction: "Keep task waiting for a future execution runtime",
    createdAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

test("start valid orchestration request", () => {
  const { orchestrator } = system();
  const result = orchestrator.start(request());
  assert.equal(result.requestId, "req_001");
  assert.equal(result.state, "READY_FOR_EXECUTION");
});

test("task is created", () => {
  const { orchestrator, tasks } = system();
  const result = orchestrator.start(request());
  assert.equal(tasks.hasTask(result.taskId as string), true);
});

test("agent is assigned", () => {
  const { orchestrator, tasks } = system();
  const result = orchestrator.start(request());
  assert.equal(tasks.getTask(result.taskId as string).assignedTo, "principal_engineer");
  assert.equal(result.agentId, "principal_engineer");
});

test("policy is evaluated", () => {
  const { orchestrator } = system();
  const result = orchestrator.start(request());
  assert.equal(result.policyResult?.decision, "ALLOW");
});

test("LOW risk valid request reaches READY_FOR_EXECUTION", () => {
  const { orchestrator } = system();
  assert.equal(orchestrator.start(request({ riskLevel: "LOW" })).state, "READY_FOR_EXECUTION");
});

test("MEDIUM risk valid request reaches READY_FOR_EXECUTION", () => {
  const { orchestrator } = system();
  assert.equal(
    orchestrator.start(request({ riskLevel: "MEDIUM", requestedPermissions: ["FILESYSTEM_WRITE"] }))
      .state,
    "READY_FOR_EXECUTION",
  );
});

test("HIGH risk without approval reaches WAITING_FOR_APPROVAL", () => {
  const { orchestrator, approvals } = system();
  const result = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  assert.equal(result.state, "WAITING_FOR_APPROVAL");
  assert.equal(approvals.getApproval(result.approvalId as string).status, "PENDING");
});

test("approval is created", () => {
  const { orchestrator, approvals } = system();
  const result = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  assert.equal(approvals.hasApproval(result.approvalId as string), true);
});

test("approval is NOT automatically approved", () => {
  const { orchestrator, approvals } = system();
  const result = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  assert.equal(approvals.getApproval(result.approvalId as string).status, "PENDING");
  assert.equal(approvals.getApproval(result.approvalId as string).approvedBy, null);
});

test("approved request re-evaluates policy", () => {
  const { orchestrator } = system();
  const started = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  const after = orchestrator.approve(started.requestId, started.approvalId as string, "human:operator");
  assert.equal(after.policyResult?.decision, "ALLOW");
});

test("approved request reaches READY_FOR_EXECUTION", () => {
  const { orchestrator } = system();
  const started = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  const after = orchestrator.approve(started.requestId, started.approvalId as string, "human:operator");
  assert.equal(after.state, "READY_FOR_EXECUTION");
});

test("rejected approval does not authorize execution", () => {
  const { orchestrator, approvals, tasks } = system();
  const started = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  approvals.reject(started.approvalId as string, "human:operator");
  const after = orchestrator.evaluate(started.requestId);
  assert.equal(after.state, "FAILED");
  assert.notEqual(after.state, "READY_FOR_EXECUTION");
  assert.notEqual(tasks.getTask(started.taskId as string).status, "DONE");
});

test("unknown agent is rejected", () => {
  const { orchestrator } = system();
  assert.throws(
    () =>
      orchestrator.start(
        request({ assignedAgent: "unknown_agent" as OrchestrationRequest["assignedAgent"] }),
      ),
    (error: unknown) => {
      expectCode(error, "AGENT_NOT_FOUND");
      return true;
    },
  );
});

test("unknown tool is rejected", () => {
  const { orchestrator } = system();
  assert.throws(
    () => orchestrator.start(request({ toolId: "not_a_tool" })),
    (error: unknown) => {
      expectCode(error, "INVALID_REQUEST");
      return true;
    },
  );
});

test("disabled tool is rejected", () => {
  const tasks = createTaskEngine(agents);
  const orchestrator = createOrchestrator({
    agents,
    tasks,
    handoffs: createHandoffEngine(agents, tasks),
    evidence: createEvidenceStore(),
    approvals: createApprovalEngine(agents, tasks),
    tools: createInitialToolRegistry(),
  });
  const result = orchestrator.start(request());
  assert.equal(result.state, "FAILED");
  assert.match(result.reason, /POLICY_DENIED|disabled/i);
});

test("missing permission is rejected", () => {
  const { orchestrator } = system();
  const result = orchestrator.start(
    request({ requestedPermissions: ["WEB_UPLOAD"] as OrchestrationRequest["requestedPermissions"] }),
  );
  assert.equal(result.state, "FAILED");
});

test("policy DENY becomes explicit orchestration failure/block", () => {
  const { orchestrator } = system();
  const result = orchestrator.start(
    request({ assignedAgent: "research_intelligence", toolId: "filesystem" }),
  );
  assert.equal(result.state, "FAILED");
  assert.match(result.reason, /POLICY_DENIED/);
});

test("no tool execution occurs", () => {
  const { orchestrator } = system();
  orchestrator.start(request());
  assert.equal(getToolDefinition("filesystem").enabled, false);
  assert.equal(FILESYSTEM_TOOL.enabled, false);
});

test("no Browser Use occurs", () => {
  const { orchestrator } = system();
  orchestrator.start(request());
  assert.equal(BROWSER_TOOL.enabled, false);
});

test("no Hermes execution occurs", () => {
  const { orchestrator } = system();
  const result = orchestrator.start(request());
  assert.equal(result.state, "READY_FOR_EXECUTION");
});

test("no LLM is called", () => {
  const { orchestrator } = system();
  const result = orchestrator.start(request());
  assert.equal(result.policyResult?.decision, "ALLOW");
});

test("no fake execution evidence is created", () => {
  const { orchestrator, evidence } = system();
  const result = orchestrator.start(request());
  assert.deepEqual(result.evidenceIds, []);
  assert.equal(evidence.listEvidence().length, 0);
});

test("READY_FOR_EXECUTION does not become DONE", () => {
  const { orchestrator, tasks } = system();
  const result = orchestrator.start(request());
  assert.equal(result.state, "READY_FOR_EXECUTION");
  assert.notEqual(tasks.getTask(result.taskId as string).status, "DONE");
});

test("handoff does not mark task DONE", () => {
  const { orchestrator, tasks, handoffs } = system();
  const started = orchestrator.start(request());
  orchestrator.handoff(sampleHandoff(started.taskId as string));
  assert.equal(handoffs.hasHandoff("handoff_orch_001"), true);
  assert.notEqual(tasks.getTask(started.taskId as string).status, "DONE");
  assert.equal(orchestrator.getState(started.requestId).state, "READY_FOR_EXECUTION");
});

test("approval does not modify AgentDefinition permissions", () => {
  const before = [...getAgent("principal_engineer").allowedPermissions];
  const { orchestrator } = system();
  const started = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  orchestrator.approve(started.requestId, started.approvalId as string, "human:operator");
  assert.deepEqual(getAgent("principal_engineer").allowedPermissions, before);
  assert.deepEqual(RESEARCH_INTELLIGENCE.allowedPermissions, [
    "WEB_SEARCH",
    "WEB_READ",
    "WEB_NAVIGATE",
  ]);
});

test("approval does not enable a ToolDefinition", () => {
  const { orchestrator } = system();
  const started = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  orchestrator.approve(started.requestId, started.approvalId as string, "human:operator");
  assert.equal(FILESYSTEM_TOOL.enabled, false);
  assert.equal(BROWSER_TOOL.enabled, false);
});

test("orchestrator does not bypass PolicyEngine", () => {
  const { orchestrator } = system();
  const result = orchestrator.start(
    request({ assignedAgent: "cto_architect", toolId: "filesystem" }),
  );
  assert.equal(result.policyResult?.decision, "DENY");
  assert.equal(result.state, "FAILED");
});

test("orchestrator does not bypass TaskEngine", () => {
  const { orchestrator, tasks } = system();
  const result = orchestrator.start(request());
  assert.equal(tasks.getTask(result.taskId as string).assignedTo, "principal_engineer");
});

test("orchestrator does not bypass ApprovalEngine", () => {
  const { orchestrator, approvals } = system();
  const result = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  assert.equal(approvals.getApproval(result.approvalId as string).status, "PENDING");
});

test("orchestrator does not bypass HandoffEngine", () => {
  const { orchestrator, handoffs } = system();
  const started = orchestrator.start(request());
  orchestrator.handoff(sampleHandoff(started.taskId as string));
  assert.equal(handoffs.getHandoff("handoff_orch_001").fromAgent, "principal_engineer");
});

test("state transitions reject invalid transitions", () => {
  const { orchestrator } = system();
  orchestrator.start(request());
  assert.throws(
    () => orchestrator.evaluate("req_001"),
    (error: unknown) => {
      expectCode(error, "INVALID_STATE_TRANSITION");
      return true;
    },
  );
});

test("ALLOW means authorization only", () => {
  const { orchestrator, tasks } = system();
  const result = orchestrator.start(request());
  assert.equal(result.policyResult?.decision, "ALLOW");
  assert.equal(result.state, "READY_FOR_EXECUTION");
  assert.notEqual(tasks.getTask(result.taskId as string).status, "DONE");
});

test("APPROVED means human approval only", () => {
  const { orchestrator, approvals } = system();
  const started = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  const after = orchestrator.approve(started.requestId, started.approvalId as string, "human:operator");
  assert.equal(approvals.getApproval(started.approvalId as string).status, "APPROVED");
  assert.equal(after.state, "READY_FOR_EXECUTION");
});

test("neither ALLOW nor APPROVED executes a tool", () => {
  const { orchestrator } = system();
  const started = orchestrator.start(
    request({ riskLevel: "HIGH", requestedPermissions: ["FILESYSTEM_WRITE"] }),
  );
  orchestrator.approve(started.requestId, started.approvalId as string, "human:operator");
  assert.equal(FILESYSTEM_TOOL.enabled, false);
});

test("a high-risk action cannot become authorized through an unrelated approval", () => {
  const { orchestrator } = system();
  const first = orchestrator.start(
    request({
      requestId: "req_a",
      riskLevel: "HIGH",
      requestedPermissions: ["FILESYSTEM_WRITE"],
    }),
  );
  const second = orchestrator.start(
    request({
      requestId: "req_b",
      riskLevel: "HIGH",
      requestedPermissions: ["FILESYSTEM_WRITE"],
    }),
  );
  assert.throws(
    () => orchestrator.approve(second.requestId, first.approvalId as string, "human:operator"),
    (error: unknown) => {
      expectCode(error, "APPROVAL_INVALID");
      return true;
    },
  );
  assert.equal(orchestrator.getState(second.requestId).state, "WAITING_FOR_APPROVAL");
});

test("orchestrator cannot fabricate execution evidence", () => {
  const { orchestrator } = system();
  const started = orchestrator.start(request());
  assert.throws(
    () =>
      orchestrator.attachEvidence({
        evidenceId: "ev_fake_exec",
        claim: "File uploaded",
        type: "FACT",
        source: "orchestrator",
        sourceType: "system",
        supportingData: "none",
        counterEvidence: null,
        confidence: "HIGH",
        provenance: {
          actor: "system",
          toolId: "filesystem",
          capability: "FILESYSTEM_WRITE",
          method: "pretend_execute",
          origin: "system",
          executionOccurred: true,
        },
        collectedAt: "2026-08-16T00:00:00.000Z",
        taskId: started.taskId,
      }),
    (error: unknown) => {
      expectCode(error, "EXECUTION_NOT_IMPLEMENTED");
      return true;
    },
  );
});
