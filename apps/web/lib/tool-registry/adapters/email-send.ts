/**
 * Centrale email_send-adapter (TASK 19-design).
 *
 * Fail-closed keten: schema → approval (APPROVED + binding + TTL) →
 * idempotente draft-claim (conditional UPDATE = lock) → bestaande
 * fail-closed dispatcher als tweede gate → audit (recipientHash, nooit
 * body/ruw adres).
 *
 * - claim faalt (0 rijen) → ALREADY_SENT / DRAFT_CANCELLED / DRAFT_NOT_FOUND
 * - dispatcher BLOCKED of provider-fout → claim-rollback naar DRAFT
 *   (veilige, handmatige retry; GEEN ongecontroleerde automatische retry)
 */

import { createHash } from "node:crypto";

import { dispatchEmail, type EmailProvider } from "../../prospect-run/email-dispatcher.ts";
import {
  claimEmailDraft,
  getEmailDraftStatus,
  revertEmailDraftStatus,
  type EmailSql,
} from "../../email/draft-repository.ts";
import type { ApprovalGate } from "../../approvals/approval-gate.ts";

export interface EmailSendToolDeps {
  sql: EmailSql;
  tenantId: string;
  approvalGate: ApprovalGate;
  provider?: EmailProvider;
  gates?: { optedOut?: boolean; warmedUp?: boolean; rateAllowed?: boolean };
  now?: () => string;
  log?: (message: string) => void;
}

export interface EmailSendAudit {
  draftId: string;
  approvalId: string;
  recipientHash: string;
  status: string;
  providerMessageId?: string | null;
}

export interface EmailSendToolResult {
  ok: boolean;
  value?: {
    status: "SENT" | "BLOCKED";
    reason?: string;
    providerMessageId?: string | null;
  };
  error?: string;
  audit?: EmailSendAudit;
}

interface EmailSendInput {
  draftId: string;
  approvalId: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validateSendInput(input: unknown): EmailSendInput | { error: string } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { error: "INVALID_SEND_INPUT" };
  }
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !("draftId" in value) || !("approvalId" in value)) {
    return { error: "INVALID_SEND_INPUT" };
  }
  if (typeof value.draftId !== "string" || value.draftId.length === 0) {
    return { error: "INVALID_SEND_INPUT" };
  }
  if (typeof value.approvalId !== "string" || value.approvalId.length === 0) {
    return { error: "INVALID_SEND_INPUT" };
  }
  return { draftId: value.draftId, approvalId: value.approvalId };
}

/**
 * Adapter-entry. requestedAction-binding op draftId: de approval geldt
 * alleen voor exact deze draft (V2 argumentsHash volgt later).
 */
export async function executeEmailSend(
  input: unknown,
  deps: EmailSendToolDeps,
): Promise<EmailSendToolResult> {
  const validated = validateSendInput(input);
  if ("error" in validated) {
    return { ok: false, error: validated.error };
  }
  const { draftId, approvalId } = validated;

  // 1. Approval vóór de claim (APPROVED + binding + TTL — fail-closed).
  const approval = await deps.approvalGate.check({
    approvalId,
    requestedAction: `email_send:${draftId}`,
    now: deps.now?.(),
  });
  if (!approval.allowed) {
    return { ok: false, error: approval.reason };
  }

  // 2. Idempotente claim = distributed lock (DRAFT/APPROVED → SENT).
  const claimed = await claimEmailDraft(deps.sql, deps.tenantId, draftId);
  if (!claimed) {
    const status = await getEmailDraftStatus(deps.sql, deps.tenantId, draftId);
    const reason =
      status === "SENT" ? "ALREADY_SENT" : status === "CANCELLED" ? "DRAFT_CANCELLED" : "DRAFT_NOT_FOUND";
    return { ok: false, error: reason };
  }

  const log = deps.log ?? ((message: string) => console.info(`[email-send] ${message}`));
  const recipientHash = sha256(claimed.to);

  try {
    // 3. Bestaande fail-closed dispatcher als tweede gate.
    const dispatch = await dispatchEmail(
      {
        runId: `email_send:${draftId}`,
        email: claimed.to,
        draft: { subject: claimed.subject, body: claimed.body, optOutLine: claimed.optOutLine },
        optedOut: deps.gates?.optedOut ?? false,
        warmedUp: deps.gates?.warmedUp ?? true,
        rateAllowed: deps.gates?.rateAllowed ?? true,
        mode: "AUTO_SEND",
      },
      deps.provider,
    );

    if (dispatch.status === "SENT") {
      log(`draft ${draftId} SENT (${dispatch.providerMessageId ?? "no id"})`);
      return {
        ok: true,
        value: { status: "SENT", providerMessageId: dispatch.providerMessageId ?? null },
        audit: {
          draftId,
          approvalId,
          recipientHash,
          status: "SENT",
          providerMessageId: dispatch.providerMessageId ?? null,
        },
      };
    }

    // 4. BLOCKED (opt-out/warm-up/rate/provider-ontbreekt): rollback-claim.
    await revertEmailDraftStatus(deps.sql, deps.tenantId, draftId);
    log(`draft ${draftId} BLOCKED: ${dispatch.reason ?? "unknown"}`);
    return {
      ok: true,
      value: { status: "BLOCKED", reason: dispatch.reason },
      audit: { draftId, approvalId, recipientHash, status: "BLOCKED" },
    };
  } catch (error) {
    // 5. Provider-fout: rollback-claim; geen ongecontroleerde retry (REGEL 5).
    await revertEmailDraftStatus(deps.sql, deps.tenantId, draftId);
    const message = error instanceof Error ? error.message : String(error);
    log(`draft ${draftId} PROVIDER_ERROR: ${message.slice(0, 200)}`);
    return {
      ok: false,
      error: "PROVIDER_ERROR",
      audit: { draftId, approvalId, recipientHash, status: "ERROR" },
    };
  }
}
