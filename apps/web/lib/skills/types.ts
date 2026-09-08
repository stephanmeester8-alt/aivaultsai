/**
 * Digital Employee — AgentSkill-contract (Sprint 1, Unified Foundation).
 *
 * Een SKILL is wat de digitale werknemer kan; een TOOL is waarmee hij het
 * uitvoert. Skills worden NIET in prompts geschreven: elke V1-skill heeft
 * een expliciet contract (input/output/permissions/allowedTools/policy)
 * en is daarmee afzonderlijk testbaar, meetbaar, uit te zetten en te
 * upgraden.
 *
 * Harde invariant (Digital Employee v1.0):
 *   NO TENANT = NO EXECUTION
 *   assertTenantContext gooit TenantContextRequiredError zonder tenantId —
 *   nooit vertrouwen op een WHERE-clausule alleen.
 *
 * Bestaande Policy/Approval/Recorder worden door de skill-executie
 * HERGEBRUIKT (geen derde implementatie): skill → policy → budget →
 * approval → ToolRegistryV2 → recorder/audit.
 */

import type { RiskClass } from "./risk.ts";

export type SkillApprovalPolicy = "AUTO" | "POLICY" | "REQUIRED";

export interface AgentSkill {
  /** Uniek skill-id, bv. "customer.inquiry", "appointment.book". */
  id: string;
  version: string; // semver
  description: string;
  inputSchema: Readonly<Record<string, unknown>>; // strict JSON-schema
  outputSchema: Readonly<Record<string, unknown>>;
  /** Centrale permission-vereisten (zelfde taal als ToolSpec.permissions). */
  permissions: readonly string[];
  /** Tool-ids uit ToolRegistryV2 — de enige tool-toegangspoort. */
  allowedTools: readonly string[];
  /** R0-R4-risicoklasse van de skill als geheel. */
  riskClass: RiskClass;
  /**
   * AUTO   — geen approval (R0-R2)
   * POLICY — approval volgens de onderliggende tool/spec-policy (R3)
   * REQUIRED — approval altijd, geen uitzonderingen (R4)
   */
  approvalPolicy: SkillApprovalPolicy;
  execute(context: AgentContext, input: unknown): Promise<SkillResult>;
}

export interface AgentContext {
  /** Verplicht: NO TENANT = NO EXECUTION. */
  tenantId: string;
  conversationId?: string | null;
  sessionId?: string | null;
  agentId?: string;
  /** Permissions van de aanroepende agent (policy-check van de router). */
  agentPermissions?: readonly string[];
  /** ApprovalId wanneer de router approval vereist (R4/REQUIRED). */
  approvalId?: string;
  /** Door de router toegekend executionId (audit-correlatie). */
  executionId?: string;
  /** Tool-toegangspoort (ToolRegistryV2-gateway) — alleen door de router. */
  tools?: SkillToolGateway;
  now?: () => string;
  log?: (message: string) => void;
}

/**
 * De enige tool-toegangspoort binnen een skill-execution: elke tool-call
 * gaat door de router (allowedTools → registry → policy → approval →
 * executor → recorder). Skills roepen NOOIT adapters direct aan.
 */
export interface SkillToolGateway {
  execute(toolId: string, input: unknown): Promise<SkillToolOutcome>;
}

export interface SkillToolOutcome {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export type SkillResult =
  | {
      ok: true;
      value: unknown;
      /** Bewijsreferenties (bv. runId, leadId, appointmentId) voor audit. */
      evidenceRefs?: readonly string[];
    }
  | { ok: false; error: string };

export class TenantContextRequiredError extends Error {
  constructor() {
    super("Tenant context is required: NO TENANT = NO EXECUTION");
    this.name = "TenantContextRequiredError";
  }
}

/** Fail-closed tenant-invariant: gooit zonder geldige tenantId. */
export function assertTenantContext(context: AgentContext): void {
  if (typeof context.tenantId !== "string" || context.tenantId.trim().length === 0) {
    throw new TenantContextRequiredError();
  }
}
