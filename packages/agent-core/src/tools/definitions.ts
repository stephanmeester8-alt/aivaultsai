import type { ToolDefinition } from "./types.ts";

/**
 * Conceptual tool catalog. Every tool is DISABLED in production: nothing may
 * execute until a task explicitly enables a tool and registers an adapter.
 * `capabilities`, `inputSchema` and `outputSchema` satisfy the
 * ToolDefinition contract (agents/contracts/tool-definition.md).
 */

export const BROWSER_TOOL: ToolDefinition = {
  id: "browser",
  name: "Browser",
  category: "BROWSER",
  description:
    "Conceptual browser-execution tool. A future adapter may bind Browser Use. Not installed and not enabled.",
  capabilities: [
    "WEB_SEARCH",
    "WEB_READ",
    "WEB_NAVIGATE",
    "WEB_CLICK",
    "WEB_TYPE",
    "WEB_DOWNLOAD",
    "WEB_UPLOAD",
  ],
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
  inputSchema: {
    type: "object",
    properties: {
      capability: {
        type: "string",
        enum: ["WEB_SEARCH", "WEB_OPEN", "WEB_READ", "WEB_CLICK", "WEB_TYPE", "WEB_NAVIGATE", "WEB_DOWNLOAD", "WEB_UPLOAD"],
      },
      arguments: { type: "object" },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      result: { type: ["object", "null"] },
      error: { type: ["string", "null"] },
    },
  },
  enabled: false,
};

export const FILESYSTEM_TOOL: ToolDefinition = {
  id: "filesystem",
  name: "Filesystem",
  category: "FILESYSTEM",
  description:
    "Filesystem read/write inside an explicitly authorized root path. Not enabled in production.",
  capabilities: ["FILESYSTEM_READ", "FILESYSTEM_WRITE"],
  riskLevel: "MEDIUM",
  requiredPermissions: ["FILESYSTEM_READ", "FILESYSTEM_WRITE"],
  inputSchema: {
    type: "object",
    properties: {
      capability: { type: "string", enum: ["FILESYSTEM_READ", "FILESYSTEM_WRITE"] },
      arguments: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: ["string", "null"] },
        },
      },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      result: { type: ["object", "null"] },
      error: { type: ["string", "null"] },
    },
  },
  enabled: false,
};

export const TERMINAL_TOOL: ToolDefinition = {
  id: "terminal",
  name: "Terminal",
  category: "TERMINAL",
  description: "Conceptual terminal tool. No adapter exists; never enabled.",
  capabilities: ["TERMINAL_EXECUTE"],
  riskLevel: "HIGH",
  requiredPermissions: ["TERMINAL_EXECUTE"],
  inputSchema: {
    type: "object",
    properties: {
      capability: { type: "string", enum: ["TERMINAL_EXECUTE"] },
      arguments: { type: "object", properties: { command: { type: "string" } } },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      result: { type: ["object", "null"] },
      error: { type: ["string", "null"] },
    },
  },
  enabled: false,
};

export const HTTP_TOOL: ToolDefinition = {
  id: "http",
  name: "HTTP",
  category: "API",
  description:
    "Read-only HTTP(S) fetch tool with SSRF protection. Only GET requests; no mutating calls.",
  capabilities: ["API_REQUEST"],
  riskLevel: "MEDIUM",
  requiredPermissions: ["API_REQUEST"],
  inputSchema: {
    type: "object",
    properties: {
      capability: { type: "string", enum: ["API_REQUEST"] },
      arguments: {
        type: "object",
        properties: {
          url: { type: "string" },
          headers: { type: "object" },
          maxBytes: { type: "number" },
        },
      },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      result: { type: ["object", "null"] },
      error: { type: ["string", "null"] },
    },
  },
  enabled: false,
};

export const MCP_TOOL: ToolDefinition = {
  id: "mcp",
  name: "MCP",
  category: "MCP",
  description: "Conceptual MCP tool. No adapter exists; never enabled.",
  capabilities: ["MCP_EXECUTE"],
  riskLevel: "HIGH",
  requiredPermissions: ["MCP_EXECUTE"],
  inputSchema: {
    type: "object",
    properties: {
      capability: { type: "string", enum: ["MCP_EXECUTE"] },
      arguments: { type: "object" },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      result: { type: ["object", "null"] },
      error: { type: ["string", "null"] },
    },
  },
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
