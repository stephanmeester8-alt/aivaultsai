/**
 * Employee approval (TASK 17-design, employee-approval-integration.md).
 *
 * Fail-closed spiegel van de ApprovalEngine-regels voor de employee-flow:
 * - approvalId = apr_employee_{sessionId}_{actionId} (stabiel, idempotent);
 * - self-approval geweigerd (approver ≠ requestedBy; non-empty human string);
 * - PENDING-only transitions (approve/reject daarna → APPROVAL_ALREADY_RESOLVED);
 * - TTL via expiresAt (gate behandelt verstreken als EXPIRED).
 *
 * De koppeling aan de echte agent-core ApprovalEngine (met TaskEngine/
 * AgentRegistry) is een aparte stap; deze store heeft dezelfde semantiek en
 * is injectable — de orchestrator gebruikt hem als eerste klasse.
 */

import { createApprovalGate, type ApprovalGate, type ApprovalSnapshot } from "./approval-gate.ts";
import type { RiskLevel } from "../tool-registry/types.ts";

export type EmployeeApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface EmployeeApprovalRecord {
  approvalId: string;
  sessionId: string;
  actionId: string;
  requestedBy: string;
  requestedAction: string;
  riskLevel: RiskLevel;
  status: EmployeeApprovalStatus;
  approvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
  expiresAt: string | null;
}

export interface CreateEmployeeApprovalInput {
  sessionId: string;
  actionId: string;
  requestedBy: string;
  requestedAction: string;
  riskLevel: RiskLevel;
  expiresAt?: string | null;
  now?: string;
}

export interface EmployeeApprovalStore {
  /** Idempotent: bestaande approval voor dezelfde (session, action) wordt geretourneerd. */
  create(input: CreateEmployeeApprovalInput): Promise<EmployeeApprovalRecord>;
  approve(approvalId: string, approver: string): Promise<EmployeeApprovalRecord>;
  reject(approvalId: string, approver: string): Promise<EmployeeApprovalRecord>;
  get(approvalId: string): Promise<EmployeeApprovalRecord | null>;
}

export function createEmployeeApprovalId(sessionId: string, actionId: string): string {
  return `apr_employee_${sessionId}_${actionId}`;
}

function assertApprover(approver: string, requestedBy: string): void {
  if (typeof approver !== "string" || approver.trim().length === 0) {
    throw new Error("INVALID_APPROVER");
  }
  if (approver.trim() === requestedBy) {
    throw new Error("SELF_APPROVAL");
  }
}

function assertPending(record: EmployeeApprovalRecord, toStatus: string): void {
  if (record.status !== "PENDING") {
    throw new Error(
      `APPROVAL_ALREADY_RESOLVED: ${record.approvalId} is ${record.status} and cannot become ${toStatus}`,
    );
  }
}

export function createInMemoryEmployeeApprovalStore(
  now: () => string = () => new Date().toISOString(),
): EmployeeApprovalStore {
  const records = new Map<string, EmployeeApprovalRecord>();

  return {
    async create(input: CreateEmployeeApprovalInput): Promise<EmployeeApprovalRecord> {
      const approvalId = createEmployeeApprovalId(input.sessionId, input.actionId);
      const existing = records.get(approvalId);
      if (existing) return { ...existing };

      const record: EmployeeApprovalRecord = {
        approvalId,
        sessionId: input.sessionId,
        actionId: input.actionId,
        requestedBy: input.requestedBy,
        requestedAction: input.requestedAction,
        riskLevel: input.riskLevel,
        status: "PENDING",
        approvedBy: null,
        createdAt: input.now ?? now(),
        resolvedAt: null,
        expiresAt: input.expiresAt ?? null,
      };
      records.set(approvalId, record);
      return { ...record };
    },

    async approve(approvalId: string, approver: string): Promise<EmployeeApprovalRecord> {
      const record = records.get(approvalId);
      if (!record) throw new Error("APPROVAL_NOT_FOUND");
      assertApprover(approver, record.requestedBy);
      assertPending(record, "APPROVED");
      const updated: EmployeeApprovalRecord = {
        ...record,
        status: "APPROVED",
        approvedBy: approver.trim(),
        resolvedAt: now(),
      };
      records.set(approvalId, updated);
      return { ...updated };
    },

    async reject(approvalId: string, approver: string): Promise<EmployeeApprovalRecord> {
      const record = records.get(approvalId);
      if (!record) throw new Error("APPROVAL_NOT_FOUND");
      assertApprover(approver, record.requestedBy);
      assertPending(record, "REJECTED");
      const updated: EmployeeApprovalRecord = {
        ...record,
        status: "REJECTED",
        approvedBy: approver.trim(),
        resolvedAt: now(),
      };
      records.set(approvalId, updated);
      return { ...updated };
    },

    async get(approvalId: string): Promise<EmployeeApprovalRecord | null> {
      const record = records.get(approvalId);
      return record ? { ...record } : null;
    },
  };
}

/**
 * Store → ApprovalGate (IMP-5-koppeling): de email_send-adapter checkt
 * APPROVED + binding + TTL tegen de employee-approval.
 */
export function storeToApprovalGate(
  store: EmployeeApprovalStore,
  now: () => string = () => new Date().toISOString(),
): ApprovalGate {
  return createApprovalGate(async (approvalId: string): Promise<ApprovalSnapshot | null> => {
    const record = await store.get(approvalId);
    if (!record) return null;
    return {
      status: record.status,
      requestedAction: record.requestedAction,
      expiresAt: record.expiresAt,
    };
  }, now);
}
