import type { AgentRegistry } from "../agents/registry.ts";
import { isValidAgentId } from "../agents/ids.ts";
import type { TaskEngine } from "../tasks/engine.ts";
import { HandoffEngineError } from "./errors.ts";
import type { HandoffEvent } from "./events.ts";
import type { Handoff } from "./types.ts";

function now(): string {
  return new Date().toISOString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function cloneHandoff(handoff: Handoff): Handoff {
  return {
    ...handoff,
    findings: [...handoff.findings],
    decisions: [...handoff.decisions],
    evidenceIds: [...handoff.evidenceIds],
    risks: [...handoff.risks],
    openQuestions: [...handoff.openQuestions],
  };
}

export class HandoffEngine {
  readonly #handoffs = new Map<string, Handoff>();
  readonly #events: HandoffEvent[] = [];
  readonly #agents: AgentRegistry;
  readonly #tasks: TaskEngine;
  #eventCount = 0;

  constructor(agentRegistry: AgentRegistry, taskEngine: TaskEngine) {
    this.#agents = agentRegistry;
    this.#tasks = taskEngine;
  }

  createHandoff(handoff: Handoff): Handoff {
    this.#assertValidHandoff(handoff);
    if (this.#handoffs.has(handoff.handoffId)) {
      throw new HandoffEngineError(
        "HANDOFF_ALREADY_EXISTS",
        `Handoff already exists: ${handoff.handoffId}`,
      );
    }
    const stored = cloneHandoff(handoff);
    this.#handoffs.set(stored.handoffId, stored);
    this.#eventCount += 1;
    this.#events.push({
      eventId: `hevt_${this.#eventCount}`,
      handoffId: stored.handoffId,
      taskId: stored.taskId,
      fromAgent: stored.fromAgent,
      toAgent: stored.toAgent,
      timestamp: now(),
    });
    return cloneHandoff(stored);
  }

  getHandoff(handoffId: string): Handoff {
    const handoff = this.#handoffs.get(handoffId);
    if (!handoff) {
      throw new HandoffEngineError("HANDOFF_NOT_FOUND", `Unknown handoff: ${handoffId}`);
    }
    return cloneHandoff(handoff);
  }

  listHandoffs(): readonly Handoff[] {
    return [...this.#handoffs.values()].map(cloneHandoff);
  }

  hasHandoff(handoffId: string): boolean {
    return this.#handoffs.has(handoffId);
  }

  listEvents(): readonly HandoffEvent[] {
    return this.#events.map((event) => ({ ...event }));
  }

  #assertValidHandoff(handoff: Handoff): void {
    if (!isNonEmptyString(handoff.handoffId)) {
      throw new HandoffEngineError("INVALID_HANDOFF", "handoffId must be a non-empty string");
    }
    if (!isNonEmptyString(handoff.taskId)) {
      throw new HandoffEngineError("INVALID_HANDOFF", "taskId must be a non-empty string");
    }
    if (!this.#tasks.hasTask(handoff.taskId)) {
      throw new HandoffEngineError("TASK_NOT_FOUND", `Unknown task: ${handoff.taskId}`);
    }

    const fromRegistered = isValidAgentId(handoff.fromAgent) && this.#agents.has(handoff.fromAgent);
    const toRegistered = isValidAgentId(handoff.toAgent) && this.#agents.has(handoff.toAgent);
    if (!fromRegistered) {
      throw new HandoffEngineError("INVALID_AGENT", `Unknown source agent: ${String(handoff.fromAgent)}`);
    }
    if (!toRegistered) {
      throw new HandoffEngineError("INVALID_AGENT", `Unknown target agent: ${String(handoff.toAgent)}`);
    }
    if (handoff.fromAgent === handoff.toAgent) {
      throw new HandoffEngineError(
        "SELF_HANDOFF",
        `Agent ${handoff.fromAgent} cannot hand off to itself`,
      );
    }

    const fromAgent = this.#agents.get(handoff.fromAgent);
    if (!fromAgent.handoffTargets.includes(handoff.toAgent)) {
      throw new HandoffEngineError(
        "INVALID_HANDOFF_TARGET",
        `Agent ${handoff.fromAgent} cannot hand off to ${handoff.toAgent}`,
      );
    }

    if (!isNonEmptyString(handoff.objective)) {
      throw new HandoffEngineError("INVALID_HANDOFF", "objective must be a non-empty string");
    }
    if (!isNonEmptyString(handoff.completedWork)) {
      throw new HandoffEngineError("INVALID_HANDOFF", "completedWork must be present");
    }
    if (!isStringArray(handoff.findings) || handoff.findings.length === 0) {
      throw new HandoffEngineError("INVALID_HANDOFF", "findings must be present");
    }
    if (!isNonEmptyString(handoff.recommendedNextAction)) {
      throw new HandoffEngineError(
        "INVALID_HANDOFF",
        "recommendedNextAction must be present",
      );
    }
    if (!isStringArray(handoff.decisions)) {
      throw new HandoffEngineError("INVALID_HANDOFF", "decisions must be a string array");
    }
    if (!isStringArray(handoff.evidenceIds)) {
      throw new HandoffEngineError("INVALID_HANDOFF", "evidenceIds must be a string array");
    }
    if (!isStringArray(handoff.risks)) {
      throw new HandoffEngineError("INVALID_HANDOFF", "risks must be a string array");
    }
    if (!isStringArray(handoff.openQuestions)) {
      throw new HandoffEngineError("INVALID_HANDOFF", "openQuestions must be a string array");
    }
    if (!isNonEmptyString(handoff.createdAt)) {
      throw new HandoffEngineError("INVALID_HANDOFF", "createdAt must be a non-empty string");
    }
  }
}

export function createHandoffEngine(
  agentRegistry: AgentRegistry,
  taskEngine: TaskEngine,
): HandoffEngine {
  return new HandoffEngine(agentRegistry, taskEngine);
}
