/**
 * Digital Employee — R0-R4 risicoklassen (Sprint 1, Unified Foundation).
 *
 * Centraal model naast de bestaande RiskLevel (LOW..CRITICAL):
 *
 *   R0 — READ              lezen/zoeken (website, knowledge, CRM-lezen)
 *   R1 — ANALYZE           analyseren/classificeren (research, intent)
 *   R2 — DRAFT/INTERNAL    drafts en interne opslag zonder externe actie
 *   R3 — BUSINESS WRITE    CRM wijzigen, afspraak boeken (policy-afhankelijk)
 *   R4 — EXTERNAL/SENSITIVE  mail verzenden, definitieve/gevoelige acties
 *
 * Invarianten (fail-closed):
 *   - R4 ⇒ APPROVAL REQUIRED, NO EXCEPTIONS;
 *   - DENY beats ALLOW: elke weigering (policy/tenant/disabled) wint;
 *   - riskClassOfToolSpec is een PURE afleiding uit bestaande ToolSpec-
 *     velden — bestaand approval-gedrag verandert niet (BEFORE ≈ AFTER).
 */

import type { ToolSpec } from "../tool-registry/types.ts";

export const RISK_CLASSES = ["R0", "R1", "R2", "R3", "R4"] as const;

export type RiskClass = (typeof RISK_CLASSES)[number];

export const RISK_CLASS_LABELS: Readonly<Record<RiskClass, string>> = {
  R0: "READ",
  R1: "ANALYZE",
  R2: "DRAFT/INTERNAL",
  R3: "BUSINESS WRITE",
  R4: "EXTERNAL/SENSITIVE",
};

export const RISK_CLASS_RANK: Readonly<Record<RiskClass, number>> = {
  R0: 0,
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4,
};

export function isRiskClass(value: unknown): value is RiskClass {
  return typeof value === "string" && (RISK_CLASSES as readonly string[]).includes(value);
}

/** Invariant: R4 vereist altijd approval — geen uitzonderingen. */
export function approvalRequiredForRiskClass(riskClass: RiskClass): boolean {
  return riskClass === "R4";
}

export interface AllowanceInput {
  /** Uitkomst van de policy-check (agent-permissions etc.). */
  policyAllowed: boolean;
  /** Tenant-beleid (OFF wint altijd). */
  tenantAllowed: boolean;
  /** Tool/skill enabled? */
  enabled: boolean;
}

/**
 * DENY beats ALLOW (fail-closed): alleen ALLOW als élke laag toestaat.
 */
export function resolveAllowance(input: AllowanceInput): boolean {
  return input.policyAllowed && input.tenantAllowed && input.enabled;
}

/**
 * Pure afleiding van de risicoklasse uit een bestaande ToolSpec.
 * Gedocumenteerde mapping (Sprint 1; expliciete per-tool-klassen kunnen
 * later het veld riskClass op ToolSpec worden zonder gedragswijziging):
 *
 *   R4 — EXTERNAL_SIDE_EFFECT | DESTRUCTIVE | CRITICAL | WRITE+HIGH
 *        (bv. email_send, calendar_cancel)
 *   R3 — overige WRITE (CRM/calendar writes; approval volgt spec-policy)
 *   R2 — WRITE zonder approval-policy (drafts/interne opslag)
 *   R1 — READ met riskLevel MEDIUM/HIGH (research, analyse, CRM-lezen)
 *   R0 — READ met riskLevel LOW
 */
export function riskClassOfToolSpec(spec: ToolSpec): RiskClass {
  if (
    spec.class === "EXTERNAL_SIDE_EFFECT" ||
    spec.class === "DESTRUCTIVE" ||
    spec.riskLevel === "CRITICAL" ||
    (spec.class === "WRITE" && spec.riskLevel === "HIGH")
  ) {
    return "R4";
  }
  if (spec.class === "WRITE") return spec.requiresApproval ? "R3" : "R2";
  // READ
  return spec.riskLevel === "LOW" ? "R0" : "R1";
}
