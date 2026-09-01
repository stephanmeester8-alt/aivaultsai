import assert from "node:assert/strict";
import { test } from "node:test";

import { dispatchEmail } from "../lib/prospect-run/email-dispatcher.ts";
import { runProspectAgent } from "../lib/prospect-run/prospect-agent.ts";
import { dispatchAllowed, renderTemplate, sanitizeIntelligenceContext } from "../lib/prospect-run/policy.ts";
import { matchSalesRoute, scoreProspect } from "../lib/prospect-run/scoring.ts";

test("prospect scoring penalizes unknowns instead of treating them as evidence", () => {
  const score = scoreProspect({
    pains: ["SaaS seat-cost creep"], evidence: ["Public pricing page"], unknowns: ["CRM", "conversion"],
    commercialOpportunity: 90, evidenceBaseline: 70, uncertainty: 80,
  });
  assert.equal(score.total, 65);
  assert.equal(score.uncertaintyPenalty, 16);
});

test("route matching prefers compliance before cost reduction", () => {
  assert.equal(matchSalesRoute({ pains: ["GDPR audit bottleneck"], evidence: ["SaaS seat costs"], unknowns: [], commercialOpportunity: 1, evidenceBaseline: 1, uncertainty: 1 }), "HITL_COMPLIANCE");
});

test("template rendering never leaves untrusted tokens executable", () => {
  assert.equal(renderTemplate("Hello {{NAME}}", { NAME: "Ada" }), "Hello Ada");
  assert.match(sanitizeIntelligenceContext("mail ada@example.com or +31 6 12345678"), /redacted/);
});

test("auto send is blocked until every compliance and warmup guard passes", () => {
  assert.deepEqual(dispatchAllowed({ email: "buyer@example.com", optedOut: false, warmedUp: false, rateAllowed: true, autoSendEnabled: true }), { allowed: false, reason: "SENDING_DOMAIN_NOT_WARMED" });
  assert.deepEqual(dispatchAllowed({ email: "buyer@example.com", optedOut: true, warmedUp: true, rateAllowed: true, autoSendEnabled: true }), { allowed: false, reason: "RECIPIENT_OPTED_OUT" });
});

test("human review queues a draft and never invokes an email provider", async () => {
  const result = await dispatchEmail({ runId: "run-1", email: "buyer@example.com", optedOut: false, warmedUp: true, rateAllowed: true, mode: "HUMAN_REVIEW", draft: { subject: "Hello", body: "Body", optOutLine: "Opt out" } }, {
    send: async () => { throw new Error("must not send"); },
  });
  assert.deepEqual(result, { status: "QUEUED", reason: "HITL_REVIEW_REQUIRED" });
});

test("agent requires an atomic claim and blocks drafts without verified email", async () => {
  const manifests: unknown[] = [];
  const result = await runProspectAgent("11111111-1111-4111-8111-111111111111", {
    companyName: "Example BV", websiteUrl: "https://example.com", knownPainPoints: ["manual qualification"],
  }, "HUMAN_REVIEW", {
    claimRun: async () => true,
    analyze: async () => ({ pains: ["manual qualification"], evidence: ["public workflow"], unknowns: ["CRM"], commercialOpportunity: 80, evidenceBaseline: 70, uncertainty: 20 }),
    persistManifest: async (manifest) => { manifests.push(manifest); },
    now: () => "2026-08-31T00:00:00.000Z",
  });
  assert.equal(result.state, "BLOCKED");
  assert.equal(result.blockedReason, "VERIFIED_BUSINESS_EMAIL_REQUIRED");
  assert.equal(manifests.length, 1);
});
