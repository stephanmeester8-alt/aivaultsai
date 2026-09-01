/**
 * Approval-gate (app-laag) — TASK 19/17-koppeling.
 *
 * Fail-closed spiegel van de agent-core ApprovalEngine-regels die de
 * email_send-adapter nodig heeft, zonder koppeling aan TaskEngine/
 * AgentRegistry (die koppeling volgt in de employee-approval-taak).
 *
 * - onbekende approvalId        → DENY (APPROVAL_NOT_FOUND)
 * - expiresAt verstreken        → DENY (APPROVAL_EXPIRED) — ongeacht status
 * - status ≠ APPROVED           → DENY (APPROVAL_NOT_APPROVED / APPROVAL_REJECTED)
 * - requestedAction mismatch    → DENY (APPROVAL_BINDING_MISMATCH)
 */

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface ApprovalSnapshot {
  readonly status: ApprovalStatus;
  readonly requestedAction: string;
  readonly expiresAt?: string | null;
}

export type ApprovalLookup = (approvalId: string) => Promise<ApprovalSnapshot | null>;

export interface ApprovalCheckInput {
  approvalId: string;
  requestedAction: string;
  now?: string;
}

export type ApprovalCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export interface ApprovalGate {
  check(input: ApprovalCheckInput): Promise<ApprovalCheckResult>;
}

export function createApprovalGate(
  lookup: ApprovalLookup,
  now: () => string = () => new Date().toISOString(),
): ApprovalGate {
  return {
    async check(input: ApprovalCheckInput): Promise<ApprovalCheckResult> {
      const approval = await lookup(input.approvalId);
      if (!approval) {
        return { allowed: false, reason: "APPROVAL_NOT_FOUND" };
      }
      const current = input.now ?? now();
      if (approval.expiresAt && current > approval.expiresAt) {
        return { allowed: false, reason: "APPROVAL_EXPIRED" };
      }
      if (approval.status !== "APPROVED") {
        const reason =
          approval.status === "REJECTED" ? "APPROVAL_REJECTED" : "APPROVAL_NOT_APPROVED";
        return { allowed: false, reason };
      }
      if (approval.requestedAction !== input.requestedAction) {
        return { allowed: false, reason: "APPROVAL_BINDING_MISMATCH" };
      }
      return { allowed: true };
    },
  };
}
