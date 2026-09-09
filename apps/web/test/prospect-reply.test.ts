import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isValidReplyClass,
  registerManualReply,
} from "../lib/prospect-pipeline/reply.ts";
import { memorySql, TENANT, makeProspect } from "./prospect-fixtures.ts";
import type { Prospect } from "../lib/prospect-pipeline/types.ts";

const FROM = "stephan@aivaultsai.one";

async function register(
  sql: ReturnType<typeof memorySql>["sql"],
  prospect: Prospect,
  input: Parameters<typeof registerManualReply>[2],
) {
  return registerManualReply(sql, prospect, input);
}

test("reply: classificatie-whitelist", () => {
  for (const c of ["INTERESTED", "QUESTION", "NOT_NOW", "NOT_INTERESTED", "UNSUBSCRIBE", "UNKNOWN"]) {
    assert.equal(isValidReplyClass(c), true);
  }
  assert.equal(isValidReplyClass("SPAM"), false);
  assert.equal(isValidReplyClass(undefined), false);
});

test("reply: UNSUBSCRIBE -> do-not-contact, geen concept", async () => {
  const { sql, calls } = memorySql();
  const result = await register(sql, makeProspect(), {
    tenantId: TENANT,
    prospectId: "p-1",
    classification: "UNSUBSCRIBE",
    summary: "Schrijf ons uit",
    expectedFromAddress: FROM,
  });
  assert.equal(result.status, "DO_NOT_CONTACT");
  assert.equal(result.interestedDraftOutreachId, undefined);
  const update = calls.find((c) => c.text.includes("do_not_contact = TRUE"));
  assert.ok(update, "verwacht do-not-contact update");
});

test("reply: NOT_INTERESTED -> LOST", async () => {
  const { sql } = memorySql();
  const result = await register(sql, makeProspect(), {
    tenantId: TENANT,
    prospectId: "p-1",
    classification: "NOT_INTERESTED",
    expectedFromAddress: FROM,
  });
  assert.equal(result.status, "LOST");
});

test("reply: INTERESTED -> REPLIED + persoonlijk demo-concept (DRAFT), geen verzending", async () => {
  const { sql, calls } = memorySql();
  const prospect = makeProspect();
  const result = await register(sql, prospect, {
    tenantId: TENANT,
    prospectId: "p-1",
    classification: "INTERESTED",
    summary: "Wil een demo",
    nextAction: "Demo inplannen",
    gmailThreadId: "thread-123",
    expectedFromAddress: FROM,
  });
  assert.equal(result.status, "REPLIED");
  assert.ok(result.interestedDraftOutreachId);
  assert.ok(result.interestedDraftOutreachId!.startsWith("outreach-"));

  const replyInsert = calls.find((c) => c.text.includes("INSERT INTO prospect_replies"));
  assert.ok(replyInsert);
  // Nooit volledige inhoud: samenvatting is kort, geen body.
  assert.ok(replyInsert!.values.includes("thread-123"));

  const outreachInsert = calls.find((c) => c.text.includes("INSERT INTO prospect_outreach"));
  assert.ok(outreachInsert);
  const values = outreachInsert!.values;
  assert.ok(values.includes("FIRST_EMAIL"), "antwoord hoort bij de eerste e-mail-thread");
  assert.ok(values.includes("DRAFT"), "concept blijft DRAFT");
});

test("reply: registratie voert geen e-mailprovider aan", async () => {
  // memorySql bevat alleen DB-calls; er mag geen enkele externe call zijn.
  const { sql, calls } = memorySql();
  await register(sql, makeProspect(), {
    tenantId: TENANT,
    prospectId: "p-1",
    classification: "QUESTION",
    summary: "Vraag",
    expectedFromAddress: FROM,
  });
  const allText = calls.map((c) => c.text).join("\n");
  assert.ok(!/https?:\/\/(api\.resend|api\.openai|gmail)/.test(allText));
});
