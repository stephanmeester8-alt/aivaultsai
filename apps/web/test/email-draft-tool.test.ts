import assert from "node:assert/strict";
import { test } from "node:test";

import { executeEmailDraft, assertDraftBounds } from "../lib/tool-registry/adapters/email-draft.ts";
import type { EmailSql } from "../lib/email/draft-repository.ts";
import { executeEmployeeTool } from "../lib/autonomous-employee/registry-adapter.ts";
import { createDefaultToolRegistry } from "../lib/tool-registry/tools.ts";
import type { EmployeeToolContext } from "../lib/autonomous-employee/types.ts";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "22222222-2222-2222-2222-222222222222";

/** In-memory sql die de ON CONFLICT-semantiek van email_drafts simuleert. */
function makeFakeSql() {
  const store = new Map<string, { draft_id: string }>();
  let seq = 0;
  const sql: EmailSql = async (strings, ...values) => {
    const query = strings.join("?");
    if (query.includes("INSERT INTO email_drafts")) {
      const [tenantId, sessionId, actionId] = values as [string, string | null, string | null];
      const key = `${tenantId}|${sessionId ?? "∅"}|${actionId ?? "∅"}`;
      if (store.has(key)) return [];
      seq += 1;
      const draftId = `draft_${seq}`;
      store.set(key, { draft_id: draftId });
      return [{ draft_id: draftId }];
    }
    if (query.includes("SELECT draft_id FROM email_drafts")) {
      const [tenantId, sessionId, actionId] = values as [string, string | null, string | null];
      const key = `${tenantId}|${sessionId ?? "∅"}|${actionId ?? "∅"}`;
      const row = store.get(key);
      return row ? [{ draft_id: row.draft_id }] : [];
    }
    return [];
  };
  return { sql, store };
}

function makeDeps(overrides: Partial<Parameters<typeof executeEmailDraft>[1]> = {}) {
  const { sql } = makeFakeSql();
  return {
    sql,
    tenantId: TENANT_ID,
    sessionId: SESSION_ID,
    actionId: "action_test",
    now: () => "2026-09-01T08:00:00.000Z",
    log: () => {},
    ...overrides,
  };
}

const VALID_INPUT = {
  to: "info@acme.nl",
  companyName: "Acme BV",
  domain: "acme.nl",
  evidenceRefs: ["https://acme.nl"],
};

test("email-draft: valide input → draftId + DRAFT-status", async () => {
  const result = await executeEmailDraft(VALID_INPUT, makeDeps());
  assert.equal(result.ok, true);
  assert.equal(result.value?.status, "DRAFT");
  assert.ok(result.value?.draftId);
  assert.ok(result.value?.subject.includes("Acme BV"));
  assert.ok(result.value?.optOutLine.length > 0);
  assert.equal(result.audit?.created, true);
  assert.equal(result.audit?.subjectLength, result.value?.subject.length);
});

test("email-draft: idempotent (zelfde tenant/sessie/actie → zelfde draftId)", async () => {
  const deps = makeDeps(); // één gedeelde store voor beide calls
  const first = await executeEmailDraft(VALID_INPUT, deps);
  const second = await executeEmailDraft(VALID_INPUT, deps);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.value?.draftId, first.value?.draftId);
  assert.equal(second.audit?.created, false);
});

test("email-draft: ongeldige input → DENY (fail-closed)", async () => {
  const deps = makeDeps();
  assert.equal((await executeEmailDraft({ companyName: "Acme", domain: "acme.nl" }, deps)).ok, false);
  assert.equal(
    (await executeEmailDraft({ ...VALID_INPUT, send: true }, deps)).ok, // veldsmokkel
    false,
  );
  assert.equal(
    (await executeEmailDraft({ ...VALID_INPUT, to: "x".repeat(321) }, deps)).ok,
    false,
  );
  assert.equal(
    (await executeEmailDraft({ ...VALID_INPUT, companyName: "" }, deps)).ok,
    false,
  );
  assert.equal((await executeEmailDraft("geen-object", deps)).ok, false);
});

test("email-draft: subject-bounds → DENY (nooit afkappen)", async () => {
  const result = await executeEmailDraft(
    { ...VALID_INPUT, companyName: "X".repeat(200) },
    makeDeps(),
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "SUBJECT_TOO_LONG");
});

test("email-draft: assertDraftBounds (body > 5000 → DENY)", () => {
  assert.equal(assertDraftBounds("ok", "b".repeat(5001)), "BODY_TOO_LONG");
  assert.equal(assertDraftBounds("ok", "body"), null);
  assert.equal(assertDraftBounds("s".repeat(201), "body"), "SUBJECT_TOO_LONG");
});

test("email-draft: PII-bewust — audit met toHash, nooit ruw adres/body", async () => {
  const result = await executeEmailDraft(VALID_INPUT, makeDeps());
  assert.ok(result.audit);
  assert.match(result.audit.toHash, /^[0-9a-f]{64}$/);
  assert.notEqual(result.audit.toHash, VALID_INPUT.to);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("info@acme.nl"));
});

test("email-draft: determinisme (zelfde input → zelfde subject/body)", async () => {
  const first = await executeEmailDraft(VALID_INPUT, makeDeps());
  const second = await executeEmailDraft(VALID_INPUT, makeDeps());
  assert.equal(second.value?.subject, first.value?.subject);
  assert.equal(second.value?.body, first.value?.body);
});

test("email-draft: geen send-pad (geen provider/network-afhankelijkheid)", async () => {
  // De adapter heeft geen provider-dependency; de test slaagt zonder netwerk.
  const result = await executeEmailDraft(VALID_INPUT, makeDeps());
  assert.equal(result.ok, true);
});

test("employee-adapter: email_draft is nu gebonden (TASK 18 §6)", async () => {
  const { sql } = makeFakeSql();
  const ctx: EmployeeToolContext = {
    tenantId: TENANT_ID,
    sql,
    fetchImpl: undefined,
    lookup: undefined,
    now: () => "2026-09-01T08:00:00.000Z",
    log: () => {},
  };
  const result = await executeEmployeeTool("email_draft", VALID_INPUT, ctx, createDefaultToolRegistry());
  assert.equal(result.ok, true);
  assert.equal(result.policy.allowed, true);
  const value = result.value as { status: string; draftId: string };
  assert.equal(value.status, "DRAFT");
  assert.ok(value.draftId);
});
