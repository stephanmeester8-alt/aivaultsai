import { isValidAgentId } from "../agents/ids.ts";
import { EvidenceStoreError } from "./errors.ts";
import {
  isValidConfidence,
  isValidEvidenceType,
  isValidProvenanceOrigin,
  type Confidence,
  type Evidence,
  type EvidenceType,
} from "./types.ts";

const EXECUTION_CLAIM_PATTERN =
  /\b(browser opened|file uploaded|executed|navigated to|clicked|downloaded|uploaded)\b/i;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidTimestamp(value: unknown): boolean {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function cloneEvidence(evidence: Evidence): Evidence {
  return {
    ...evidence,
    provenance: { ...evidence.provenance },
  };
}

function looksLikeExecutionClaim(claim: string): boolean {
  return EXECUTION_CLAIM_PATTERN.test(claim);
}

export class EvidenceStore {
  readonly #records = new Map<string, Evidence>();

  createEvidence(evidence: Evidence): Evidence {
    this.#assertValid(evidence);
    if (this.#records.has(evidence.evidenceId)) {
      throw new EvidenceStoreError(
        "EVIDENCE_ALREADY_EXISTS",
        `Evidence already exists: ${evidence.evidenceId}`,
      );
    }
    const stored = cloneEvidence(evidence);
    this.#records.set(stored.evidenceId, stored);
    return cloneEvidence(stored);
  }

  getEvidence(evidenceId: string): Evidence {
    const evidence = this.#records.get(evidenceId);
    if (!evidence) {
      throw new EvidenceStoreError("EVIDENCE_NOT_FOUND", `Unknown evidence: ${evidenceId}`);
    }
    return cloneEvidence(evidence);
  }

  listEvidence(): readonly Evidence[] {
    return [...this.#records.values()].map(cloneEvidence);
  }

  hasEvidence(evidenceId: string): boolean {
    return this.#records.has(evidenceId);
  }

  listByTask(taskId: string): readonly Evidence[] {
    return this.listEvidence().filter((item) => item.taskId === taskId);
  }

  listByAgent(agentId: string): readonly Evidence[] {
    return this.listEvidence().filter((item) => item.agentId === agentId);
  }

  listByType(type: EvidenceType): readonly Evidence[] {
    return this.listEvidence().filter((item) => item.type === type);
  }

  listByConfidence(confidence: Confidence): readonly Evidence[] {
    return this.listEvidence().filter((item) => item.confidence === confidence);
  }

  #assertValid(evidence: Evidence): void {
    if (!isNonEmptyString(evidence.evidenceId)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "evidenceId must be a non-empty string");
    }
    if (!isNonEmptyString(evidence.claim)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "claim must be a non-empty string");
    }
    if (!isNonEmptyString(evidence.source)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "source must be a non-empty string");
    }
    if (!isNonEmptyString(evidence.sourceType)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "sourceType must be a non-empty string");
    }
    if (!isValidEvidenceType(evidence.type)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", `Invalid evidence type: ${String(evidence.type)}`);
    }
    if (!isValidConfidence(evidence.confidence)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", `Invalid confidence: ${String(evidence.confidence)}`);
    }
    if (typeof evidence.supportingData !== "string") {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "supportingData must be a string");
    }
    if (evidence.counterEvidence !== null && typeof evidence.counterEvidence !== "string") {
      throw new EvidenceStoreError(
        "INVALID_EVIDENCE",
        "counterEvidence must be a string or null",
      );
    }
    if (!isValidTimestamp(evidence.collectedAt)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "collectedAt must be a valid timestamp");
    }
    if ((evidence.source === "none" || evidence.source === "unknown") && evidence.confidence === "HIGH") {
      throw new EvidenceStoreError(
        "INVALID_EVIDENCE",
        "HIGH confidence requires an explicit source",
      );
    }
    this.#assertProvenance(evidence);
    this.#assertOptionalRefs(evidence);
    this.#assertExecutionRules(evidence);
  }

  #assertProvenance(evidence: Evidence): void {
    const provenance = evidence.provenance;
    if (!provenance || typeof provenance !== "object") {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "provenance is malformed");
    }
    if (!isNonEmptyString(provenance.actor)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "provenance.actor must be a non-empty string");
    }
    if (provenance.toolId !== null && typeof provenance.toolId !== "string") {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "provenance.toolId must be a string or null");
    }
    if (provenance.capability !== null && typeof provenance.capability !== "string") {
      throw new EvidenceStoreError(
        "INVALID_EVIDENCE",
        "provenance.capability must be a string or null",
      );
    }
    if (!isNonEmptyString(provenance.method)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "provenance.method must be a non-empty string");
    }
    if (!isValidProvenanceOrigin(provenance.origin)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "provenance.origin is required and must be valid");
    }
    if (typeof provenance.executionOccurred !== "boolean") {
      throw new EvidenceStoreError(
        "INVALID_EVIDENCE",
        "provenance.executionOccurred must be a boolean",
      );
    }
    if (provenance.executionId !== undefined && provenance.executionId !== null) {
      if (typeof provenance.executionId !== "string" || provenance.executionId.trim().length === 0) {
        throw new EvidenceStoreError(
          "INVALID_EVIDENCE",
          "provenance.executionId must be a non-empty string when set",
        );
      }
    }
  }

  #assertOptionalRefs(evidence: Evidence): void {
    if (evidence.taskId != null && !isNonEmptyString(evidence.taskId)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", "taskId must be a non-empty string when set");
    }
    if (evidence.agentId != null && !isValidAgentId(evidence.agentId)) {
      throw new EvidenceStoreError("INVALID_EVIDENCE", `Invalid agentId: ${String(evidence.agentId)}`);
    }
  }

  #assertExecutionRules(evidence: Evidence): void {
    const provenance = evidence.provenance;
    if (provenance.origin === "browser" || provenance.toolId === "browser") {
      throw new EvidenceStoreError(
        "INVALID_EVIDENCE",
        "browser provenance cannot be recorded as actual browser execution",
      );
    }
    if (provenance.executionOccurred === false) {
      // No execution claim may be stored as a fact without execution.
      if (
        looksLikeExecutionClaim(evidence.claim) &&
        (evidence.type === "FACT" || evidence.type === "INDEPENDENTLY_VERIFIED")
      ) {
        throw new EvidenceStoreError(
          "INVALID_EVIDENCE",
          "execution claims cannot be stored as FACT or INDEPENDENTLY_VERIFIED without execution",
        );
      }
    }
    // executionOccurred === true is accepted ONLY as real execution evidence:
    // the caller (Execution Gate / runtime) must assert a tool actually ran.
    // The store itself still never upgrades epistemic types.
  }
}

export function createEvidenceStore(): EvidenceStore {
  return new EvidenceStore();
}
