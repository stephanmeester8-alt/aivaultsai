import type { LeadQualification } from "./lead-types";

export type QualificationValidationResult =
  | {
      valid: true;
    }
  | {
      valid: false;
      errors: string[];
    };

export function validateLeadQualification(
  qualification: LeadQualification,
): QualificationValidationResult {
  const errors: string[] = [];

  if (
    !Number.isInteger(qualification.score) ||
    qualification.score < 0 ||
    qualification.score > 100
  ) {
    errors.push("score must be an integer between 0 and 100");
  }

  if (!["LOW", "MEDIUM", "HIGH"].includes(qualification.confidence)) {
    errors.push("confidence must be LOW, MEDIUM, or HIGH");
  }

  if (!qualification.reason.trim()) {
    errors.push("reason must not be empty");
  }

  if (!qualification.qualifiedAt.trim()) {
    errors.push("qualifiedAt must not be empty");
  }

  if (!qualification.qualifiedBy.trim()) {
    errors.push("qualifiedBy must not be empty");
  }

  if (
    !Array.isArray(qualification.supportingEventIds) ||
    qualification.supportingEventIds.length === 0
  ) {
    errors.push("supportingEventIds must contain at least one event");
  }

  if (
    qualification.supportingEventIds.some(
      (eventId) => typeof eventId !== "string" || !eventId.trim(),
    )
  ) {
    errors.push("supportingEventIds must contain non-empty event IDs");
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}
