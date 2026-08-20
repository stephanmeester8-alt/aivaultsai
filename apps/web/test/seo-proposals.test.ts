import assert from "node:assert/strict";
import { test } from "node:test";

import { generateProposals } from "../lib/seo/proposals.ts";
import type { Finding } from "../lib/seo/types.ts";

function finding(type: string, overrides: Partial<Finding> = {}): Finding {
  return {
    id: `f_${type}`,
    type,
    severity: "MEDIUM",
    claim: `Claim voor ${type}`,
    url: "https://www.example.com/",
    confidence: "HIGH",
    epistemicType: "FACT",
    evidence: [{ sourceType: "crawl", signal: "x", value: null }],
    ...overrides,
  };
}

test("a proposal is generated from a known finding type", () => {
  const proposals = generateProposals([finding("MISSING_TITLE")]);
  assert.equal(proposals.length, 1);
  const proposal = proposals[0]!;
  assert.equal(proposal.findingId, "f_MISSING_TITLE");
  assert.equal(proposal.issue, "Claim voor MISSING_TITLE");
  assert.equal(proposal.severity, "MEDIUM");
  assert.equal(proposal.affectedUrl, "https://www.example.com/");
  assert.equal(proposal.confidence, "HIGH");
});

test("a proposal carries all required fields", () => {
  const [proposal] = generateProposals([finding("MISSING_CANONICAL")]);
  assert.ok(proposal);
  for (const key of [
    "proposalId",
    "findingId",
    "issue",
    "severity",
    "affectedUrl",
    "recommendedChange",
    "expectedBenefit",
    "risk",
    "confidence",
    "validationMethod",
  ] as const) {
    assert.equal(typeof proposal[key] === "string" || key === "affectedUrl", true, key);
  }
  assert.equal(typeof proposal.recommendedChange, "string");
  assert.ok(proposal.recommendedChange.length > 0);
  assert.equal(typeof proposal.validationMethod, "string");
  assert.ok(proposal.validationMethod.length > 0);
});

test("unknown finding types produce no proposal", () => {
  const proposals = generateProposals([finding("SOME_UNKNOWN_TYPE")]);
  assert.equal(proposals.length, 0);
});

test("proposal ids are sequential", () => {
  const proposals = generateProposals([
    finding("MISSING_TITLE"),
    finding("STRUCTURED_DATA_MISSING"),
  ]);
  assert.equal(proposals[0]!.proposalId, "prop_1");
  assert.equal(proposals[1]!.proposalId, "prop_2");
});

test("proposals keep the finding severity and confidence", () => {
  const proposals = generateProposals([
    finding("NOINDEX", { severity: "CRITICAL", confidence: "HIGH" }),
  ]);
  assert.equal(proposals[0]!.severity, "CRITICAL");
  assert.equal(proposals[0]!.confidence, "HIGH");
});
