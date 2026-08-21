export const EVIDENCE_TYPES = [
  "FACT",
  "COMPANY_CLAIM",
  "INDEPENDENTLY_VERIFIED",
  "INFERENCE",
  "HYPOTHESIS",
  "ASSUMPTION",
  "UNKNOWN",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;

export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const PROVENANCE_ORIGINS = [
  "manual",
  "agent_research",
  "browser",
  "api",
  "user",
  "system",
] as const;

export type ProvenanceOrigin = (typeof PROVENANCE_ORIGINS)[number];

export type EvidenceProvenance = {
  readonly actor: string;
  readonly toolId: string | null;
  readonly capability: string | null;
  readonly method: string;
  readonly origin?: ProvenanceOrigin;
  readonly executionOccurred?: boolean;
  /** ExecutionGate execution id, required for real execution evidence. */
  readonly executionId?: string | null;
};

export type Evidence = {
  readonly evidenceId: string;
  readonly claim: string;
  readonly type: EvidenceType;
  readonly source: string;
  readonly sourceType: string;
  readonly supportingData: string;
  readonly counterEvidence: string | null;
  readonly confidence: Confidence;
  readonly provenance: EvidenceProvenance;
  readonly collectedAt: string;
  readonly taskId?: string | null;
  readonly agentId?: string | null;
};

export function isValidEvidenceType(value: unknown): value is EvidenceType {
  return typeof value === "string" && (EVIDENCE_TYPES as readonly string[]).includes(value);
}

export function isValidConfidence(value: unknown): value is Confidence {
  return typeof value === "string" && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

export function isValidProvenanceOrigin(value: unknown): value is ProvenanceOrigin {
  return (
    typeof value === "string" && (PROVENANCE_ORIGINS as readonly string[]).includes(value)
  );
}

export function isDirectlyObserved(type: EvidenceType): boolean {
  return type === "FACT" || type === "INDEPENDENTLY_VERIFIED";
}
