import type { ToolId } from "../tools/types.ts";
import type { ExecutionRequest, ExecutionResult } from "./types.ts";

/**
 * Tool execution seam. Adapters run the actual side effect (filesystem,
 * HTTP, …). They are only reachable through the Execution Gate: agents and
 * the orchestrator never call an adapter directly. An adapter that is not
 * registered means the tool is explicitly unavailable — nothing executes.
 */
export type ToolAdapter = {
  readonly id: string;
  readonly toolId: ToolId;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
};

export class ToolAdapterRegistry {
  readonly #adapters = new Map<string, ToolAdapter>();

  register(adapter: ToolAdapter): void {
    if (this.#adapters.has(adapter.id)) {
      throw new Error(`Duplicate adapter id: ${adapter.id}`);
    }
    this.#adapters.set(adapter.id, adapter);
  }

  get(adapterId: string): ToolAdapter | undefined {
    return this.#adapters.get(adapterId);
  }

  getByTool(toolId: string): ToolAdapter | undefined {
    return [...this.#adapters.values()].find((adapter) => adapter.toolId === toolId);
  }

  has(adapterId: string): boolean {
    return this.#adapters.has(adapterId);
  }

  list(): readonly ToolAdapter[] {
    return [...this.#adapters.values()];
  }
}

export function createToolAdapterRegistry(): ToolAdapterRegistry {
  return new ToolAdapterRegistry();
}
