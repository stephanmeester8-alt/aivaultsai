import type { DispatchMode, OutreachDraft } from "./types.ts";
import { dispatchAllowed, hashRecipient } from "./policy.ts";

export interface EmailProvider {
  send(input: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<{ providerMessageId: string }>;
}

export interface DispatchRequest {
  runId: string;
  email?: string;
  draft: OutreachDraft;
  optedOut: boolean;
  warmedUp: boolean;
  rateAllowed: boolean;
  mode: DispatchMode;
}

/**
 * The dispatcher only sends with an injected, explicitly configured provider.
 * The default deployment uses HUMAN_REVIEW and therefore only queues drafts.
 */
export async function dispatchEmail(
  request: DispatchRequest,
  provider: EmailProvider | undefined,
): Promise<{ status: "QUEUED" | "SENT" | "BLOCKED"; reason?: string; recipientHash?: string; providerMessageId?: string }> {
  if (request.mode === "HUMAN_REVIEW") {
    return { status: "QUEUED", reason: "HITL_REVIEW_REQUIRED" };
  }
  const allowed = dispatchAllowed({
    email: request.email,
    optedOut: request.optedOut,
    warmedUp: request.warmedUp,
    rateAllowed: request.rateAllowed,
    autoSendEnabled: true,
  });
  if (!allowed.allowed) return { status: "BLOCKED", reason: allowed.reason };
  if (!provider || !request.email) return { status: "BLOCKED", reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };

  const recipientHash = hashRecipient(request.email);
  const sent = await provider.send({
    to: request.email,
    subject: request.draft.subject,
    text: `${request.draft.body}\n\n${request.draft.optOutLine}`,
    idempotencyKey: `${request.runId}:${recipientHash}`,
  });
  return { status: "SENT", recipientHash, providerMessageId: sent.providerMessageId };
}
