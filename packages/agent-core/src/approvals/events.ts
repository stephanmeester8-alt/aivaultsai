import type { ApprovalStatus } from "./types.ts";

export const APPROVAL_EVENT_TYPES = [
  "APPROVAL_CREATED",
  "APPROVAL_APPROVED",
  "APPROVAL_REJECTED",
  "APPROVAL_EXPIRED",
] as const;

export type ApprovalEventType = (typeof APPROVAL_EVENT_TYPES)[number];

export type ApprovalEvent = {
  readonly eventId: string;
  readonly approvalId: string;
  readonly taskId: string;
  readonly type: ApprovalEventType;
  readonly timestamp: string;
  readonly fromStatus: ApprovalStatus | null;
  readonly toStatus: ApprovalStatus;
  readonly approver: string | null;
};
