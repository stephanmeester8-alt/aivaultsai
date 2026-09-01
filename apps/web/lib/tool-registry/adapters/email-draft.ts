/**
 * Centrale email_draft-adapter (TASK 18-design, §4).
 *
 * Fail-closed:
 * - schema-validatie (additionalProperties: false — geen veldsmokkel);
 * - boundary-checks: subject ≤ 200, body ≤ 5 000, to ≤ 320 → DENY (nooit afkappen);
 * - idempotente opslag via email_drafts (migratie 006);
 * - GEEN netwerk/provider-pad: deze adapter kan nooit versturen.
 *
 * Hergebruik: draftOutreach (prospect-run) — geen parallelle generator.
 */

import { createHash } from "node:crypto";

import { draftOutreach } from "../../prospect-run/prospect-agent.ts";
import type { ProspectInput, ProspectIntelligence } from "../../prospect-run/types.ts";
import { upsertEmailDraft, type EmailSql } from "../../email/draft-repository.ts";

const TO_MAX = 320;
const COMPANY_NAME_MAX = 200;
const DOMAIN_MAX = 253;
const SUBJECT_MAX = 200;
const BODY_MAX = 5_000;

export interface EmailDraftToolDeps {
  sql: EmailSql;
  tenantId: string;
  sessionId?: string | null;
  actionId?: string | null;
  now?: () => string;
  log?: (message: string) => void;
}

export interface EmailDraftAudit {
  toHash: string;
  subjectLength: number;
  bodyLength: number;
  created: boolean;
}

export interface EmailDraftToolResult {
  ok: boolean;
  value?: {
    draftId: string;
    subject: string;
    body: string;
    optOutLine: string;
    status: "DRAFT";
  };
  error?: string;
  audit?: EmailDraftAudit;
}

interface EmailDraftInput {
  to: string;
  companyName: string;
  domain: string;
  evidenceRefs?: readonly string[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Schema-validatie (fail-closed, additionalProperties: false). */
function validateDraftInput(input: unknown): EmailDraftInput | { error: string } {
  if (!isRecord(input)) return { error: "INVALID_DRAFT_INPUT" };
  const allowed = new Set(["to", "companyName", "domain", "evidenceRefs"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) return { error: "INVALID_DRAFT_INPUT" };
  }
  const { to, companyName, domain, evidenceRefs } = input;
  if (typeof to !== "string" || to.length < 3 || to.length > TO_MAX) {
    return { error: "INVALID_DRAFT_INPUT" };
  }
  if (typeof companyName !== "string" || companyName.trim().length === 0 || companyName.length > COMPANY_NAME_MAX) {
    return { error: "INVALID_DRAFT_INPUT" };
  }
  if (typeof domain !== "string" || domain.trim().length === 0 || domain.length > DOMAIN_MAX) {
    return { error: "INVALID_DRAFT_INPUT" };
  }
  if (evidenceRefs !== undefined) {
    if (!Array.isArray(evidenceRefs) || evidenceRefs.length > 10) {
      return { error: "INVALID_DRAFT_INPUT" };
    }
    for (const ref of evidenceRefs) {
      if (typeof ref !== "string" || ref.trim().length === 0) {
        return { error: "INVALID_DRAFT_INPUT" };
      }
    }
  }
  return { to, companyName, domain, evidenceRefs: evidenceRefs as readonly string[] | undefined };
}

/**
 * Boundary-check op de gegenereerde draft: overschrijding = DENY (nooit
 * afkappen — een afgekapte e-mail mag nooit worden goedgekeurd/verstuurd).
 */
export function assertDraftBounds(subject: string, body: string): string | null {
  if (subject.length > SUBJECT_MAX) return "SUBJECT_TOO_LONG";
  if (body.length > BODY_MAX) return "BODY_TOO_LONG";
  return null;
}

function buildMinimalIntelligence(): ProspectIntelligence {
  return {
    pains: ["operational bottlenecks"],
    evidence: [],
    unknowns: [],
    commercialOpportunity: 0,
    evidenceBaseline: 0,
    uncertainty: 0,
  };
}

/**
 * Adapter-entry: valideer → genereer (draftOutreach) → bounds → idempotente
 * opslag → audit (toHash; nooit het ruwe adres of de body).
 */
export async function executeEmailDraft(
  input: unknown,
  deps: EmailDraftToolDeps,
): Promise<EmailDraftToolResult> {
  const validated = validateDraftInput(input);
  if ("error" in validated) {
    return { ok: false, error: validated.error };
  }

  const prospectInput: ProspectInput = {
    companyName: validated.companyName,
    websiteUrl: `https://${validated.domain}`,
  };
  const draft = draftOutreach(prospectInput, buildMinimalIntelligence());

  const boundsError = assertDraftBounds(draft.subject, draft.body);
  if (boundsError) {
    return { ok: false, error: boundsError };
  }

  const stored = await upsertEmailDraft(deps.sql, {
    tenantId: deps.tenantId,
    sessionId: deps.sessionId ?? null,
    actionId: deps.actionId ?? null,
    to: validated.to,
    subject: draft.subject,
    body: draft.body,
    optOutLine: draft.optOutLine,
  });

  deps.log?.(
    `[email-draft:${deps.tenantId}] draft ${stored.draftId} (created=${stored.created})`,
  );

  return {
    ok: true,
    value: {
      draftId: stored.draftId,
      subject: draft.subject,
      body: draft.body,
      optOutLine: draft.optOutLine,
      status: "DRAFT",
    },
    audit: {
      toHash: sha256(validated.to),
      subjectLength: draft.subject.length,
      bodyLength: draft.body.length,
      created: stored.created,
    },
  };
}
