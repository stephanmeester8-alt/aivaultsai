export type { AgentId, AgentStatus } from "./agents/ids.ts";
export { AGENT_IDS, AGENT_STATUSES, isValidAgentId, isValidAgentStatus } from "./agents/ids.ts";

export type { AgentCapability } from "./agents/capabilities.ts";
export { AGENT_CAPABILITIES, isValidAgentCapability } from "./agents/capabilities.ts";

export type { AgentDefinition } from "./agents/types.ts";

export {
  CTO_ARCHITECT,
  GROWTH_ANALYTICS,
  INITIAL_AGENTS,
  PRINCIPAL_ENGINEER,
  PRODUCT_UX,
  RESEARCH_INTELLIGENCE,
} from "./agents/definitions.ts";

export {
  AgentRegistry,
  createAgentRegistry,
  createInitialAgentRegistry,
  getAgent,
} from "./agents/registry.ts";

export type { Task, TaskCreatedBy, TaskPriority, TaskStatus } from "./tasks/types.ts";
export {
  TASK_PRIORITIES,
  TASK_PRIORITY_MIN,
  TASK_PRIORITY_MAX,
  TASK_STATUSES,
  createTask,
  isValidTaskPriority,
  isValidTaskStatus,
  riskToPriority,
} from "./tasks/types.ts";
export { TaskEngineError, isTaskEngineError } from "./tasks/errors.ts";
export type { TaskEngineErrorCode } from "./tasks/errors.ts";
export { TASK_TRANSITIONS, allowedTransitions, canTransition } from "./tasks/transitions.ts";
export type { TaskEvent, TaskEventType } from "./tasks/events.ts";
export { TASK_EVENT_TYPES } from "./tasks/events.ts";
export { TaskEngine, createTaskEngine } from "./tasks/engine.ts";
export type { TaskPatch } from "./tasks/engine.ts";

export type { Handoff } from "./handoffs/types.ts";
export { createHandoff } from "./handoffs/types.ts";
export { HandoffEngineError, isHandoffEngineError } from "./handoffs/errors.ts";
export type { HandoffEngineErrorCode } from "./handoffs/errors.ts";
export type { HandoffEvent, HandoffEventType } from "./handoffs/events.ts";
export { HANDOFF_EVENT_TYPES } from "./handoffs/events.ts";
export { HandoffEngine, createHandoffEngine } from "./handoffs/engine.ts";

export type { Confidence, Evidence, EvidenceProvenance, EvidenceType, ProvenanceOrigin } from "./evidence/types.ts";
export {
  CONFIDENCE_LEVELS,
  EVIDENCE_TYPES,
  PROVENANCE_ORIGINS,
  isDirectlyObserved,
  isValidConfidence,
  isValidEvidenceType,
  isValidProvenanceOrigin,
} from "./evidence/types.ts";
export { EvidenceStoreError, isEvidenceStoreError } from "./evidence/errors.ts";
export type { EvidenceStoreErrorCode } from "./evidence/errors.ts";
export { EvidenceStore, createEvidenceStore } from "./evidence/store.ts";

export type { BrowserToolAdapter, ToolCategory, ToolDefinition, ToolId } from "./tools/types.ts";
export { TOOL_CATEGORIES, TOOL_IDS, isValidToolCategory, isValidToolId } from "./tools/types.ts";
export {
  BROWSER_TOOL,
  FILESYSTEM_TOOL,
  HTTP_TOOL,
  MCP_TOOL,
  TERMINAL_TOOL,
  TOOL_DEFINITIONS,
  getToolDefinition,
} from "./tools/definitions.ts";
export {
  ToolRegistry,
  createInitialToolRegistry,
  createToolRegistry,
} from "./tools/registry.ts";
export { FilesystemAdapter, HttpAdapter, createSafeAdapterRegistry } from "./tools/adapters/index.ts";

export type { Permission, PermissionDecision } from "./permissions/types.ts";
export { PERMISSIONS, isValidPermission } from "./permissions/types.ts";
export type { RiskLevel } from "./permissions/risk.ts";
export { RISK_LEVELS, isValidRiskLevel } from "./permissions/risk.ts";
export { agentAllowsPermission, checkAgentPermission } from "./permissions/check.ts";
export type { PolicyDecision, PolicyRequest, PolicyResult } from "./permissions/policy-types.ts";
export { POLICY_DECISIONS, isValidPolicyDecision } from "./permissions/policy-types.ts";
export { TOOL_REQUIRED_CAPABILITIES, isApprovalRiskSufficient } from "./permissions/policy-rules.ts";
export { evaluatePolicy } from "./permissions/policy-engine.ts";

export type { Approval, ApprovalStatus } from "./approvals/types.ts";
export {
  APPROVAL_STATUSES,
  createApproval,
  isValidApprovalStatus,
  requiresHumanApproval,
} from "./approvals/types.ts";
export { ApprovalEngineError, isApprovalEngineError } from "./approvals/errors.ts";
export type { ApprovalEngineErrorCode } from "./approvals/errors.ts";
export { APPROVAL_TRANSITIONS, canTransitionApproval } from "./approvals/transitions.ts";
export type { ApprovalEvent, ApprovalEventType } from "./approvals/events.ts";
export { APPROVAL_EVENT_TYPES } from "./approvals/events.ts";
export { ApprovalEngine, createApprovalEngine } from "./approvals/engine.ts";

export type { OrchestrationRequest, OrchestrationResult } from "./orchestration/types.ts";
export type { OrchestrationState } from "./orchestration/states.ts";
export {
  ORCHESTRATION_STATES,
  ORCHESTRATION_TRANSITIONS,
  canTransitionOrchestration,
} from "./orchestration/states.ts";
export { OrchestratorError, isOrchestratorError } from "./orchestration/errors.ts";
export type { OrchestratorErrorCode } from "./orchestration/errors.ts";
export { Orchestrator, createOrchestrator } from "./orchestration/orchestrator.ts";
export type { OrchestratorDependencies } from "./orchestration/orchestrator.ts";

export type { ExecutionRequest, ExecutionResult, ExecutionStatus } from "./execution/types.ts";
export { EXECUTION_STATUSES } from "./execution/types.ts";
export type { ToolAdapter } from "./execution/adapters.ts";
export { ToolAdapterRegistry, createToolAdapterRegistry } from "./execution/adapters.ts";
export { ExecutionGate, createExecutionGate } from "./execution/gate.ts";
export type { ExecutionGateDependencies } from "./execution/gate.ts";

export type { RunRecorder, RunRecordEntry } from "./persistence/types.ts";
export { NoopRunRecorder } from "./persistence/types.ts";

export type { AgentRun, AgentRunRequest, AgentRunState } from "./runtime/types.ts";
export { AGENT_RUN_STATES } from "./runtime/types.ts";
export { RuntimeError, isRuntimeError } from "./runtime/errors.ts";
export type { RuntimeErrorCode } from "./runtime/errors.ts";
export { AgentRuntime, createAgentRuntime } from "./runtime/agent-runtime.ts";
export type { AgentRuntimeDependencies } from "./runtime/agent-runtime.ts";
