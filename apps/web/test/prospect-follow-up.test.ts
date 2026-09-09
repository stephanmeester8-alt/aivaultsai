import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canPrepareFollowUp,
  canSendFollowUp,
  describeBlock,
  statusAfterReply,
} from "../lib/prospect-pipeline/follow-up.ts";
import { makeFollowUp, makeProspect } from "./prospect-fixtures.ts";

const NOW = new Date("2026-01-08T09:00:00.000Z"); // do 8 jan (3 werkdagen na ma 5 jan)

function firstSent(iso: string) {
  return iso;
}

test("follow-up vóór twee werkdagen wordt geblokkeerd (MIN_WAIT_NOT_ELAPSED)", () => {
  const prospect = makeProspect({ status: "WAITING_FOR_REPLY" });
  // Eerste e-mail ma 5 jan; nu di 6 jan = 1 werkdag.
  const decision = canPrepareFollowUp({
    prospect,
    firstEmailSentAt: firstSent("2026-01-05T09:00:00.000Z"),
    now: new Date("2026-01-06T09:00:00.000Z"),
    existingFollowUp: null,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.allowed === false && decision.reason, "MIN_WAIT_NOT_ELAPSED");
});

test("follow-up na twee volledige werkdagen is toegestaan", () => {
  const prospect = makeProspect({ status: "WAITING_FOR_REPLY" });
  const decision = canPrepareFollowUp({
    prospect,
    firstEmailSentAt: firstSent("2026-01-05T09:00:00.000Z"),
    now: NOW,
    existingFollowUp: null,
  });
  assert.deepEqual(decision, { allowed: true, reason: "FOLLOW_UP_DUE" });
});

test("follow-up na reactie wordt geblokkeerd (ALREADY_REPLIED)", () => {
  const prospect = makeProspect({ status: "REPLIED", replyStatus: "QUESTION" });
  const decision = canPrepareFollowUp({
    prospect,
    firstEmailSentAt: firstSent("2026-01-05T09:00:00.000Z"),
    now: NOW,
    existingFollowUp: null,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.allowed === false && decision.reason, "ALREADY_REPLIED");
});

test("follow-up na bounce wordt geblokkeerd (BOUNCED)", () => {
  const prospect = makeProspect({ status: "BOUNCED" });
  const decision = canPrepareFollowUp({
    prospect,
    firstEmailSentAt: firstSent("2026-01-05T09:00:00.000Z"),
    now: NOW,
    existingFollowUp: null,
  });
  assert.equal(decision.allowed === false && decision.reason, "BOUNCED");
});

test("follow-up bij do-not-contact wordt geblokkeerd (DO_NOT_CONTACT)", () => {
  const prospect = makeProspect({ status: "DO_NOT_CONTACT", doNotContact: true });
  const decision = canPrepareFollowUp({
    prospect,
    firstEmailSentAt: firstSent("2026-01-05T09:00:00.000Z"),
    now: NOW,
    existingFollowUp: null,
  });
  assert.equal(decision.allowed === false && decision.reason, "DO_NOT_CONTACT");
});

test("tweede follow-up wordt geblokkeerd (FOLLOW_UP_EXISTS)", () => {
  const prospect = makeProspect({ status: "WAITING_FOR_REPLY" });
  const decision = canPrepareFollowUp({
    prospect,
    firstEmailSentAt: firstSent("2026-01-05T09:00:00.000Z"),
    now: NOW,
    existingFollowUp: makeFollowUp(),
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.allowed === false && decision.reason, "FOLLOW_UP_EXISTS");
});

test("follow-up zonder eerste e-mail wordt geblokkeerd (NOT_SENT_YET)", () => {
  const prospect = makeProspect({ status: "NEW", firstEmailSentAt: null });
  const decision = canPrepareFollowUp({
    prospect,
    firstEmailSentAt: null,
    now: NOW,
    existingFollowUp: null,
  });
  assert.equal(decision.allowed === false && decision.reason, "NOT_SENT_YET");
});

test("verzending zonder approval wordt geblokkeerd (FOLLOW_UP_NOT_APPROVED)", () => {
  const prospect = makeProspect({ status: "WAITING_FOR_REPLY" });
  const decision = canSendFollowUp({
    prospect,
    approvedFollowUp: null,
    expectedFromAddress: "stephan@aivaultsai.one",
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.allowed === false && decision.reason, "FOLLOW_UP_NOT_APPROVED");
});

test("concept (DRAFT) is geen verzending en vereist later nog approval", () => {
  const draft = makeFollowUp({ status: "DRAFT" });
  const prospect = makeProspect({ status: "WAITING_FOR_REPLY" });
  // Concept bestaat; verzending vereist APPROVED:
  const send = canSendFollowUp({
    prospect,
    approvedFollowUp: draft,
    expectedFromAddress: "stephan@aivaultsai.one",
  });
  assert.equal(send.allowed, false);
});

test("verkeerde afzender wordt geblokkeerd (WRONG_SENDER)", () => {
  const prospect = makeProspect({ status: "WAITING_FOR_REPLY" });
  const decision = canSendFollowUp({
    prospect,
    approvedFollowUp: makeFollowUp({
      status: "APPROVED",
      fromAddress: "verkeerd@example.com",
    }),
    expectedFromAddress: "stephan@aivaultsai.one",
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.allowed === false && decision.reason, "WRONG_SENDER");
});

test("verzending met APPROVED follow-up en juiste afzender is toegestaan", () => {
  const prospect = makeProspect({ status: "WAITING_FOR_REPLY" });
  const decision = canSendFollowUp({
    prospect,
    approvedFollowUp: makeFollowUp({ status: "APPROVED" }),
    expectedFromAddress: "stephan@aivaultsai.one",
  });
  assert.deepEqual(decision, { allowed: true });
});

test("statusAfterReply: UNSUBSCRIBE -> DO_NOT_CONTACT, NOT_INTERESTED -> LOST", () => {
  assert.equal(statusAfterReply("UNSUBSCRIBE"), "DO_NOT_CONTACT");
  assert.equal(statusAfterReply("NOT_INTERESTED"), "LOST");
  assert.equal(statusAfterReply("INTERESTED"), "REPLIED");
  assert.equal(statusAfterReply("QUESTION"), "REPLIED");
});

test("describeBlock levert leesbare uitleg (nooit verzonden)", () => {
  assert.ok(describeBlock("DO_NOT_CONTACT").toLowerCase().includes("do-not-contact"));
  assert.ok(describeBlock("MIN_WAIT_NOT_ELAPSED").includes("werkdagen"));
});
