import type { RiskLevel } from "../permissions/risk.ts";
import type { Permission } from "../permissions/types.ts";

export const TOOL_CATEGORIES = [
  "BROWSER",
  "FILESYSTEM",
  "TERMINAL",
  "API",
  "MCP",
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export const TOOL_IDS = ["browser", "filesystem", "terminal", "http", "mcp"] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export type ToolDefinition = {
  readonly id: ToolId;
  readonly name: string;
  readonly category: ToolCategory;
  readonly description: string;
  /** Permission-gated operations this tool can perform (contract: capabilities). */
  readonly capabilities: readonly string[];
  readonly riskLevel: RiskLevel;
  readonly requiredPermissions: readonly Permission[];
  /** Invocation input shape (contract: input_schema). Advisory, not schema-validated. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
  /** Result shape (contract: output_schema). Advisory, not schema-validated. */
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly enabled: boolean;
};

export function isValidToolId(value: unknown): value is ToolId {
  return typeof value === "string" && (TOOL_IDS as readonly string[]).includes(value);
}

export function isValidToolCategory(value: unknown): value is ToolCategory {
  return typeof value === "string" && (TOOL_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Replaceable browser-execution backend. Browser Use would be one future
 * adapter. This interface is a definition seam only — no adapter is installed.
 */
export type BrowserToolAdapter = {
  readonly id: string;
  readonly toolId: "browser";
  readonly enabled: false;
};
