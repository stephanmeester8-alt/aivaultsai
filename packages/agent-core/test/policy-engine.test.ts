import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BROWSER_TOOL,
  FILESYSTEM_TOOL,
  HTTP_TOOL,
  RESEARCH_INTELLIGENCE,
  TERMINAL_TOOL,
  createAgentRegistry,
  createApproval,
  createInitialAgentRegistry,
  createInitialToolRegistry,
  createToolRegistry,
  evaluatePolicy,
  getToolDefinition,
  type Approval,
  type PolicyRequest,
  type ToolDefinition,
} from "../src/index.ts";

const agents = createInitialAgentRegistry();

function enable(tool: ToolDefinition): ToolDefinition {
  return { ...tool, enabled: true };
}

function toolsWith(...defs: ToolDefinition[]) {
  const registry = createToolRegistry();
  for (const def of defs) {
    registry.register(def);
  }
  return registry;
}

function request(
  partial: Partial<PolicyRequest> &
    Pick<PolicyRequest, "agentId" | "toolId" | "requestedPermissions" | "riskLevel">,
): PolicyRequest {
  const { approvalId, taskId, ...rest } = partial;
  return {
    requestId: rest.requestId ?? "req_001",
    ...(approvalId !== undefined ? { approvalId } : {}),
    ...(taskId !== undefined ? { taskId } : {}),
    ...rest,
  };
}

function approval(partial: Partial<Approval> & Pick<Approval, "status" | "riskLevel" | "requestedBy">): Approval {
  return createApproval({
    approvalId: partial.approvalId ?? "apr_001",
    taskId: partial.taskId ?? "task_001",
    requestedAction: partial.requestedAction ?? "test-action",
    riskLevel: partial.riskLevel,
    requestedBy: partial.requestedBy,
    approvedBy: partial.status === "APPROVED" || partial.status === "REJECTED" ? "human" : null,
    status: partial.status,
    createdAt: "2026-08-16T00:00:00.000Z",
    resolvedAt:
      partial.status === "PENDING" ? null : "2026-08-16T00:01:00.000Z",
  });
}

test("unknown agent → DENY", () => {
  const result = evaluatePolicy(
    request({
      agentId: "unknown_agent",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_READ"],
      riskLevel: "LOW",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /Unknown agent/);
});

test("unknown tool → DENY", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "not_a_tool",
      requestedPermissions: ["FILESYSTEM_READ"],
      riskLevel: "LOW",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /Unknown tool/);
});

test("disabled tool → DENY", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_READ"],
      riskLevel: "LOW",
    }),
    agents,
    createInitialToolRegistry(),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /disabled/);
});

test("prohibited tool → DENY", () => {
  const result = evaluatePolicy(
    request({
      agentId: "research_intelligence",
      toolId: "terminal",
      requestedPermissions: ["TERMINAL_EXECUTE"],
      riskLevel: "LOW",
    }),
    agents,
    toolsWith(enable(TERMINAL_TOOL)),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /prohibited/);
});

test("missing permission → DENY", () => {
  const result = evaluatePolicy(
    request({
      agentId: "growth_analytics",
      toolId: "browser",
      requestedPermissions: ["WEB_UPLOAD"],
      riskLevel: "LOW",
    }),
    agents,
    toolsWith(enable(BROWSER_TOOL)),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.ok(result.missingPermissions.includes("WEB_UPLOAD"));
});

test("missing capability → DENY", () => {
  const registry = createAgentRegistry();
  registry.register({
    ...RESEARCH_INTELLIGENCE,
    allowedTools: ["terminal"],
    prohibitedTools: ["browser", "filesystem", "http", "mcp"],
    allowedPermissions: ["TERMINAL_EXECUTE"],
    prohibitedPermissions: RESEARCH_INTELLIGENCE.prohibitedPermissions.filter(
      (permission) => permission !== "TERMINAL_EXECUTE",
    ),
  });
  const result = evaluatePolicy(
    request({
      agentId: "research_intelligence",
      toolId: "terminal",
      requestedPermissions: ["TERMINAL_EXECUTE"],
      riskLevel: "LOW",
    }),
    registry,
    toolsWith(enable(TERMINAL_TOOL)),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /capability/);
});

test("LOW risk with valid permissions → ALLOW", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_READ"],
      riskLevel: "LOW",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    null,
  );
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.approvalRequired, false);
});

test("MEDIUM risk with valid permissions → ALLOW", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_WRITE"],
      riskLevel: "MEDIUM",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    null,
  );
  assert.equal(result.decision, "ALLOW");
});

test("HIGH risk without approval → APPROVAL_REQUIRED", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_WRITE"],
      riskLevel: "HIGH",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    null,
  );
  assert.equal(result.decision, "APPROVAL_REQUIRED");
  assert.equal(result.approvalRequired, true);
});

test("CRITICAL risk without approval → APPROVAL_REQUIRED", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "terminal",
      requestedPermissions: ["TERMINAL_EXECUTE"],
      riskLevel: "CRITICAL",
    }),
    agents,
    toolsWith(enable(TERMINAL_TOOL)),
    null,
  );
  assert.equal(result.decision, "APPROVAL_REQUIRED");
});

test("HIGH risk with rejected approval → DENY", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_WRITE"],
      riskLevel: "HIGH",
      approvalId: "apr_001",
      taskId: "task_001",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    approval({
      status: "REJECTED",
      riskLevel: "HIGH",
      requestedBy: "principal_engineer",
    }),
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /rejected/);
});

test("HIGH risk with approved approval → ALLOW", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_WRITE"],
      riskLevel: "HIGH",
      approvalId: "apr_001",
      taskId: "task_001",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    approval({
      status: "APPROVED",
      riskLevel: "HIGH",
      requestedBy: "principal_engineer",
    }),
  );
  assert.equal(result.decision, "ALLOW");
});

test("CRITICAL risk with approved approval → ALLOW", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "terminal",
      requestedPermissions: ["TERMINAL_EXECUTE"],
      riskLevel: "CRITICAL",
      approvalId: "apr_001",
      taskId: "task_001",
    }),
    agents,
    toolsWith(enable(TERMINAL_TOOL)),
    approval({
      status: "APPROVED",
      riskLevel: "CRITICAL",
      requestedBy: "principal_engineer",
    }),
  );
  assert.equal(result.decision, "ALLOW");
});

test("unknown permission → DENY", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["NOT_A_PERMISSION"],
      riskLevel: "LOW",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /Unknown permission/);
});

test("empty permission set → DENY when permission is required", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: [],
      riskLevel: "LOW",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /Empty permission set/);
});

test("policy engine defaults to DENY", () => {
  const result = evaluatePolicy(
    request({
      agentId: "",
      toolId: "",
      requestedPermissions: [],
      riskLevel: "",
    }),
    createAgentRegistry(),
    createToolRegistry(),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.equal(result.approvalRequired, false);
});

test("research agent cannot execute terminal actions", () => {
  const result = evaluatePolicy(
    request({
      agentId: "research_intelligence",
      toolId: "terminal",
      requestedPermissions: ["TERMINAL_EXECUTE"],
      riskLevel: "LOW",
    }),
    agents,
    toolsWith(enable(TERMINAL_TOOL)),
    null,
  );
  assert.equal(result.decision, "DENY");
});

test("research agent cannot upload files", () => {
  const result = evaluatePolicy(
    request({
      agentId: "research_intelligence",
      toolId: "browser",
      requestedPermissions: ["WEB_UPLOAD"],
      riskLevel: "CRITICAL",
    }),
    agents,
    toolsWith(enable(BROWSER_TOOL)),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.ok(result.missingPermissions.includes("WEB_UPLOAD"));
});

test("growth agent cannot perform unauthorized mutations", () => {
  const clicks = evaluatePolicy(
    request({
      agentId: "growth_analytics",
      toolId: "browser",
      requestedPermissions: ["WEB_CLICK"],
      riskLevel: "HIGH",
    }),
    agents,
    toolsWith(enable(BROWSER_TOOL)),
    null,
  );
  const types = evaluatePolicy(
    request({
      agentId: "growth_analytics",
      toolId: "browser",
      requestedPermissions: ["WEB_TYPE"],
      riskLevel: "HIGH",
    }),
    agents,
    toolsWith(enable(BROWSER_TOOL)),
    null,
  );
  assert.equal(clicks.decision, "DENY");
  assert.equal(types.decision, "DENY");
});

test("browser tool remains disabled", () => {
  assert.equal(getToolDefinition("browser").enabled, false);
  const result = evaluatePolicy(
    request({
      agentId: "research_intelligence",
      toolId: "browser",
      requestedPermissions: ["WEB_READ"],
      riskLevel: "LOW",
    }),
    agents,
    createInitialToolRegistry(),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /disabled/);
});

test("agent cannot bypass policy by requesting a permission it does not possess", () => {
  const result = evaluatePolicy(
    request({
      agentId: "research_intelligence",
      toolId: "browser",
      requestedPermissions: ["WEB_TYPE"],
      riskLevel: "LOW",
    }),
    agents,
    toolsWith(enable(BROWSER_TOOL)),
    null,
  );
  assert.equal(result.decision, "DENY");
});

test("disabled tool cannot be used when the agent has permission", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_READ"],
      riskLevel: "LOW",
    }),
    agents,
    createInitialToolRegistry(),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /disabled/);
});

test("HIGH risk execution cannot happen without human approval", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_WRITE"],
      riskLevel: "HIGH",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    null,
  );
  assert.equal(result.decision, "APPROVAL_REQUIRED");
  assert.notEqual(result.decision, "ALLOW");
});

test("mismatched approval id is DENY", () => {
  const result = evaluatePolicy(
    request({
      agentId: "principal_engineer",
      toolId: "filesystem",
      requestedPermissions: ["FILESYSTEM_WRITE"],
      riskLevel: "HIGH",
      approvalId: "apr_other",
      taskId: "task_001",
    }),
    agents,
    toolsWith(enable(FILESYSTEM_TOOL)),
    approval({
      approvalId: "apr_001",
      status: "APPROVED",
      riskLevel: "HIGH",
      requestedBy: "principal_engineer",
    }),
  );
  assert.equal(result.decision, "DENY");
});

test("research agent is authorized for the http tool with API_REQUEST (MEDIUM)", () => {
  // Contract (TASK 24): RESEARCH_INTELLIGENCE allows the http tool and now
  // also holds the API_REQUEST permission it requires, so the safe read-only
  // production runtime execution is policy-ALLOWED without human approval.
  const result = evaluatePolicy(
    request({
      agentId: "research_intelligence",
      toolId: "http",
      requestedPermissions: ["API_REQUEST"],
      riskLevel: "MEDIUM",
    }),
    agents,
    toolsWith(enable(HTTP_TOOL)),
    null,
  );
  assert.equal(result.decision, "ALLOW");
  assert.equal(result.approvalRequired, false);
});

test("http tool remains disabled in the default catalog", () => {
  assert.equal(getToolDefinition("http").enabled, false);
  const result = evaluatePolicy(
    request({
      agentId: "research_intelligence",
      toolId: "http",
      requestedPermissions: ["API_REQUEST"],
      riskLevel: "MEDIUM",
    }),
    agents,
    createInitialToolRegistry(),
    null,
  );
  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /disabled/);
});
