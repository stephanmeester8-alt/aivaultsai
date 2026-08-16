import type { ApprovalStatus } from "./types.ts";

export const APPROVAL_TRANSITIONS: Readonly<
  Record<ApprovalStatus, readonly ApprovalStatus[]>
> = {
  PENDING: ["APPROVED", "REJECTED", "EXPIRED"],
  APPROVED: [],
  REJECTED: [],
  EXPIRED: [],
};

export function canTransitionApproval(
  from: ApprovalStatus,
  to: ApprovalStatus,
): boolean {
  return APPROVAL_TRANSITIONS[from].includes(to);
}
