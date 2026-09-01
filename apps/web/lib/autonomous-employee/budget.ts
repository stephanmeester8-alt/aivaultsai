/**
 * Autonomous Employee — budget (TASK 16-design, employee-tool-budget.md).
 *
 * Fail-closed: budget op = gecontroleerde STOP (check vóór elke tool-call,
 * geen nieuwe calls meer). DENY'd pogingen tellen mee (anti-loop); de
 * runtime-klok meet actieve tijd (start = eerste call, finish = einde run);
 * approval-wachttijd valt buiten de klok (orchestrator-verantwoordelijkheid).
 */

export interface EmployeeBudget {
  maxSteps: number;
  maxToolCalls: number;
  maxRuntimeMs: number;
  maxNetworkRequests: number;
  maxConcurrentTools?: number; // employee is sequentieel → default 1
  deadline?: string; // ISO-timestamp; verstreken → STOP
}

export interface EmployeeBudgetUsage {
  steps: number;
  toolCalls: number;
  networkRequests: number;
  runtimeMs: number;
  startedAt: string | null;
  finishedAt: string | null;
  exceeded: { field: string; used: number; limit: number } | null;
}

export const DEFAULT_EMPLOYEE_BUDGET: EmployeeBudget = {
  maxSteps: 200,
  maxToolCalls: 500,
  maxRuntimeMs: 2_700_000, // 45 min actieve tijd
  maxNetworkRequests: 200,
  maxConcurrentTools: 1,
};

export function assertValidBudget(budget: EmployeeBudget): EmployeeBudget {
  for (const field of ["maxSteps", "maxToolCalls", "maxRuntimeMs", "maxNetworkRequests"] as const) {
    if (!Number.isInteger(budget[field]) || budget[field] <= 0) {
      throw new Error(`INVALID_BUDGET: ${field} must be a positive integer`);
    }
  }
  if (budget.maxConcurrentTools !== undefined) {
    if (!Number.isInteger(budget.maxConcurrentTools) || budget.maxConcurrentTools <= 0) {
      throw new Error("INVALID_BUDGET: maxConcurrentTools must be a positive integer");
    }
  }
  if (budget.deadline !== undefined) {
    if (typeof budget.deadline !== "string" || Number.isNaN(Date.parse(budget.deadline))) {
      throw new Error("INVALID_BUDGET: deadline must be a valid ISO timestamp");
    }
  }
  return budget;
}

export type BudgetCheck =
  | { ok: true }
  | { ok: false; reason: "BUDGET_EXCEEDED"; field: string; used: number; limit: number };

export class EmployeeBudgetTracker {
  readonly #budget: EmployeeBudget;
  readonly #now: () => string;
  #steps = 0;
  #toolCalls = 0;
  #networkRequests = 0;
  #startedAt: string | null = null;
  #finishedAt: string | null = null;
  #exceeded: EmployeeBudgetUsage["exceeded"] = null;

  constructor(budget?: EmployeeBudget, now: () => string = () => new Date().toISOString()) {
    this.#budget = assertValidBudget(budget ?? DEFAULT_EMPLOYEE_BUDGET);
    this.#now = now;
  }

  #fail(field: string, used: number, limit: number): BudgetCheck {
    this.#exceeded = { field, used, limit };
    return { ok: false, reason: "BUDGET_EXCEEDED", field, used, limit };
  }

  /** Fail-closed check vóór ELKE tool-call: eerste overschreden limiet wint. */
  check(): BudgetCheck {
    if (this.#steps >= this.#budget.maxSteps) {
      return this.#fail("steps", this.#steps, this.#budget.maxSteps);
    }
    if (this.#toolCalls >= this.#budget.maxToolCalls) {
      return this.#fail("toolCalls", this.#toolCalls, this.#budget.maxToolCalls);
    }
    if (this.#networkRequests >= this.#budget.maxNetworkRequests) {
      return this.#fail("networkRequests", this.#networkRequests, this.#budget.maxNetworkRequests);
    }
    if (this.#startedAt !== null && this.#runtimeMs() >= this.#budget.maxRuntimeMs) {
      return this.#fail("runtimeMs", this.#runtimeMs(), this.#budget.maxRuntimeMs);
    }
    if (this.#budget.deadline && this.#now() > this.#budget.deadline) {
      return this.#fail("deadline", 0, 0);
    }
    return { ok: true };
  }

  /** Elke tool-call (vóór de gate): ook DENY'd pogingen tellen mee (anti-loop). */
  recordToolCall(toolId: string): void {
    void toolId; // gereserveerd voor per-tool budget-telling (toekomst); teller is run-scoped
    if (this.#startedAt === null) this.#startedAt = this.#now();
    this.#toolCalls += 1;
  }

  recordNetworkRequest(): void {
    this.#networkRequests += 1;
  }

  recordStep(): void {
    this.#steps += 1;
  }

  /** Actieve tijd (ms) sinds de eerste tool-call; vóór de eerste call: 0. */
  #runtimeMs(): number {
    if (this.#startedAt === null) return 0;
    const start = Date.parse(this.#startedAt);
    const end = Date.parse(this.#now());
    return Math.max(0, end - start);
  }

  snapshot(): EmployeeBudgetUsage {
    return {
      steps: this.#steps,
      toolCalls: this.#toolCalls,
      networkRequests: this.#networkRequests,
      runtimeMs: this.#runtimeMs(),
      startedAt: this.#startedAt,
      finishedAt: this.#finishedAt,
      exceeded: this.#exceeded,
    };
  }

  finish(): EmployeeBudgetUsage {
    this.#finishedAt = this.#now();
    return this.snapshot();
  }
}
