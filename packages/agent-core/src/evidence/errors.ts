export const EVIDENCE_STORE_ERROR_CODES = [
  "EVIDENCE_NOT_FOUND",
  "INVALID_EVIDENCE",
  "EVIDENCE_ALREADY_EXISTS",
] as const;

export type EvidenceStoreErrorCode = (typeof EVIDENCE_STORE_ERROR_CODES)[number];

export class EvidenceStoreError extends Error {
  readonly code: EvidenceStoreErrorCode;

  constructor(code: EvidenceStoreErrorCode, message: string) {
    super(message);
    this.name = "EvidenceStoreError";
    this.code = code;
  }
}

export function isEvidenceStoreError(value: unknown): value is EvidenceStoreError {
  return value instanceof EvidenceStoreError;
}
