import type { AgentCapability } from "./capabilities.ts";
import type { AgentId, AgentStatus } from "./ids.ts";
import type { Permission } from "../permissions/types.ts";
import type { RiskLevel } from "../permissions/risk.ts";
import type { ToolId } from "../tools/types.ts";

export type AgentDefinition = {
  readonly id: AgentId;
  readonly name: string;
  readonly role: string;
  readonly mission: string;
  /** Short human-readable summary (contract: description). */
  readonly description: string;
  readonly status: AgentStatus;
  readonly capabilities: readonly AgentCapability[];
  readonly allowedTools: readonly ToolId[];
  readonly prohibitedTools: readonly ToolId[];
  readonly allowedPermissions: readonly Permission[];
  readonly prohibitedPermissions: readonly Permission[];
  readonly handoffTargets: readonly AgentId[];
  readonly riskLevel: RiskLevel;
  /** Expected task input shape (contract: input_schema). Advisory. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
  /** Expected output shape (contract: output_schema). Advisory. */
  readonly outputSchema: Readonly<Record<string, unknown>>;
};
