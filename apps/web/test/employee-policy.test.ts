import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PERMISSION_POLICY,
  checkPermission,
  decideProspect,
} from "../lib/autonomous-employee/policy.ts";
import { sendEmail } from "../lib/autonomous-employee/tools.ts";

const BASE_DETECTION = {
  status: "yes" as const,
  confidence: 0.92,
  evidence: [{ type: "chat_provider_script", source: "https://acme.nl", detail: "Intercom" }],
  detectedTechnologies: ["Intercom"],
  checkedPages: ["https://acme.nl"],
};

test("permission matrix: email send requires approval, everything else allows", () => {
  assert.deepEqual(PERMISSION_POLICY["email.send"], {
    allowed: false,
    reason: "EMAIL_SEND_REQUIRES_APPROVAL",
  });
  assert.equal(checkPermission("discovery.read").allowed, true);
  assert.equal(checkPermission("website.research").allowed, true);
  assert.equal(checkPermission("ai.detect").allowed, true);
  assert.equal(checkPermission("database.read").allowed, true);
  assert.equal(checkPermission("database.write").allowed, true);
  assert.equal(checkPermission("outreach.draft").allowed, true);
  assert.equal(checkPermission("email.send").allowed, false);
  assert.equal(checkPermission("unknown.permission" as never).allowed, false);
});

test("the AI cannot send email: the send tool is structurally blocked", async () => {
  const result = await sendEmail();
  assert.equal(result.ok, false);
  assert.equal(result.error, "EMAIL_SEND_REQUIRES_APPROVAL");
  assert.equal(result.policy.allowed, false);
});

test("decision: high score with AI present -> QUALIFIED", () => {
  const decision = decideProspect({
    intelligence: {
      pains: ["manual qualification"],
      evidence: ["intercom detected", "pricing page"],
      unknowns: [],
      commercialOpportunity: 90,
      evidenceBaseline: 80,
      uncertainty: 10,
    },
    aiDetection: BASE_DETECTION,
    qualifiedThreshold: 50,
    insufficientThreshold: 30,
  });
  assert.equal(decision.decision, "QUALIFIED");
  assert.equal(decision.score.total, 84);
});

test("decision: low score -> NOT_QUALIFIED", () => {
  const decision = decideProspect({
    intelligence: {
      pains: [],
      evidence: [],
      unknowns: ["CRM data unavailable", "no signals"],
      commercialOpportunity: 10,
      evidenceBaseline: 5,
      uncertainty: 80,
    },
    aiDetection: { ...BASE_DETECTION, status: "no", confidence: 0.6 },
    qualifiedThreshold: 50,
    insufficientThreshold: 30,
  });
  assert.equal(decision.decision, "NOT_QUALIFIED");
});

test("decision: medium score -> INSUFFICIENT_EVIDENCE", () => {
  const decision = decideProspect({
    intelligence: {
      pains: ["websitevragen"],
      evidence: ["pricing page"],
      unknowns: ["CRM"],
      commercialOpportunity: 40,
      evidenceBaseline: 30,
      uncertainty: 20,
    },
    aiDetection: { ...BASE_DETECTION, status: "no", confidence: 0.6 },
    qualifiedThreshold: 50,
    insufficientThreshold: 30,
  });
  assert.equal(decision.decision, "INSUFFICIENT_EVIDENCE");
});

test("decision: UNKNOWN AI status blocks a would-be qualified prospect", () => {
  const decision = decideProspect({
    intelligence: {
      pains: ["manual qualification"],
      evidence: ["pricing page", "contact page"],
      unknowns: [],
      commercialOpportunity: 90,
      evidenceBaseline: 80,
      uncertainty: 10,
    },
    aiDetection: { ...BASE_DETECTION, status: "unknown", confidence: 0.3 },
    qualifiedThreshold: 50,
    insufficientThreshold: 30,
  });
  assert.equal(decision.decision, "INSUFFICIENT_EVIDENCE");
  assert.match(decision.reason, /UNKNOWN/);
});

test("decision: missing detection evidence -> BLOCKED", () => {
  const decision = decideProspect({
    intelligence: {
      pains: [],
      evidence: [],
      unknowns: [],
      commercialOpportunity: 90,
      evidenceBaseline: 80,
      uncertainty: 10,
    },
    aiDetection: null,
    qualifiedThreshold: 50,
    insufficientThreshold: 30,
  });
  assert.equal(decision.decision, "BLOCKED");
});
