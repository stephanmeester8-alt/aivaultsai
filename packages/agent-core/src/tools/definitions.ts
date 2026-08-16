import type { ToolDefinition } from "./types.ts";

export const BROWSER_TOOL: ToolDefinition = {
  id: "browser",
  name: "Browser",
  category: "BROWSER",
  description:
    "Conceptual browser-execution tool. A future adapter may bind Browser Use. Not installed and not enabled.",
  riskLevel: "HIGH",
  requiredPermissions: [
    "WEB_SEARCH",
    "WEB_READ",
    "WEB_NAVIGATE",
    "WEB_CLICK",
    "WEB_TYPE",
    "WEB_DOWNLOAD",
    "WEB_UPLOAD",
  ],
  enabled: false,
};

export const FILESYSTEM_TOOL: ToolDefinition = {
  id: "filesystem",
  name: "Filesystem",
  category: "FILESYSTEM",
  description: "Conceptual filesystem tool. Not implemented.",
  riskLevel: "MEDIUM",
  requiredPermissions: ["FILESYSTEM_READ", "FILESYSTEM_WRITE"],
  enabled: false,
};

export const TERMINAL_TOOL: ToolDefinition = {
  id: "terminal",
  name: "Terminal",
  category: "TERMINAL",
  description: "Conceptual terminal tool. Not implemented.",
  riskLevel: "HIGH",
  requiredPermissions: ["TERMINAL_EXECUTE"],
  enabled: false,
};

export const HTTP_TOOL: ToolDefinition = {
  id: "http",
  name: "HTTP",
  category: "API",
  description: "Conceptual HTTP/API tool. Not implemented. No external calls.",
  riskLevel: "MEDIUM",
  requiredPermissions: ["API_REQUEST"],
  enabled: false,
};

export const MCP_TOOL: ToolDefinition = {
  id: "mcp",
  name: "MCP",
  category: "MCP",
  description: "Conceptual MCP tool. Not implemented.",
  riskLevel: "HIGH",
  requiredPermissions: ["MCP_EXECUTE"],
  enabled: false,
};

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  BROWSER_TOOL,
  FILESYSTEM_TOOL,
  TERMINAL_TOOL,
  HTTP_TOOL,
  MCP_TOOL,
];

export function getToolDefinition(id: string): ToolDefinition {
  const tool = TOOL_DEFINITIONS.find((item) => item.id === id);
  if (!tool) {
    throw new Error(`Unknown tool id: ${id}`);
  }
  return tool;
}
