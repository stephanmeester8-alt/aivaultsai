import type { ToolDefinition, ToolId } from "./types.ts";
import { isValidToolId } from "./types.ts";
import { TOOL_DEFINITIONS } from "./definitions.ts";

export class ToolRegistry {
  readonly #tools = new Map<ToolId, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (!isValidToolId(tool.id)) {
      throw new Error(`Unknown tool id: ${String(tool.id)}`);
    }
    if (this.#tools.has(tool.id)) {
      throw new Error(`Duplicate tool id: ${tool.id}`);
    }
    this.#tools.set(tool.id, tool);
  }

  get(toolId: string): ToolDefinition | undefined {
    if (!isValidToolId(toolId)) {
      return undefined;
    }
    return this.#tools.get(toolId);
  }

  has(toolId: string): boolean {
    return this.get(toolId) !== undefined;
  }

  list(): readonly ToolDefinition[] {
    return [...this.#tools.values()];
  }
}

export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

export function createInitialToolRegistry(): ToolRegistry {
  const registry = createToolRegistry();
  for (const tool of TOOL_DEFINITIONS) {
    registry.register(tool);
  }
  return registry;
}
