import assert from "node:assert/strict";
import { test } from "node:test";

import {
  maybeRunCustomerZeroOrchestration,
  type FunnelDeps,
  type LeadCreatedSummary,
} from "../lib/customer-zero/assistant-funnel.ts";
import type { CustomerZeroResult } from "../lib/customer-zero/orchestrator.ts";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

function leadResult(overrides: Partial<CustomerZeroResult> = {}): CustomerZeroResult {
  return {
    intent: {
      detected: true,
      level: "COMMERCIAL_INTENT",
      score: 7,
      reasons: ["expliciete interesse"],
    },
    leadCreated: true,
    leadId: "lead-1",
    ...overrides,
  };
}

function makeFunnelDeps(overrides: Partial<FunnelDeps> = {}) {
  const notified: LeadCreatedSummary[] = [];
  const deps: FunnelDeps = {
    hasExistingLead: async () => false,
    runOrchestrator: async () => leadResult(),
    notifyLead: async (summary) => void notified.push(summary),
    ...overrides,
  };
  return { deps, notified };
}

const INPUT = {
  conversationId: CONVERSATION_ID,
  messages: [{ role: "user" as const, content: "Ik wil een AI-assistent voor mijn bedrijf." }],
};

test("funnel-notificatie: lead-creatie → notifyLead met conversationId/leadId/intent", async () => {
  const { deps, notified } = makeFunnelDeps();
  const outcome = await maybeRunCustomerZeroOrchestration(INPUT, deps);
  assert.deepEqual(outcome, { ran: true, reason: "ran" });
  assert.equal(notified.length, 1);
  assert.equal(notified[0]!.conversationId, CONVERSATION_ID);
  assert.equal(notified[0]!.leadId, "lead-1");
  assert.equal(notified[0]!.intentLevel, "COMMERCIAL_INTENT");
  assert.equal(notified[0]!.intentScore, 7);
});

test("funnel-notificatie: bestaande lead (lead_exists) → géén notificatie", async () => {
  const { deps, notified } = makeFunnelDeps({ hasExistingLead: async () => true });
  const outcome = await maybeRunCustomerZeroOrchestration(INPUT, deps);
  assert.deepEqual(outcome, { ran: false, reason: "lead_exists" });
  assert.equal(notified.length, 0);
});

test("funnel-notificatie: informatief gesprek zonder intent → géén lead, géén notificatie", async () => {
  const { deps, notified } = makeFunnelDeps({
    runOrchestrator: async () => ({
      intent: { detected: false, level: "INFORMATIONAL", score: 0, reasons: [] },
      leadCreated: false,
    }),
  });
  const outcome = await maybeRunCustomerZeroOrchestration(INPUT, deps);
  assert.deepEqual(outcome, { ran: true, reason: "ran" });
  assert.equal(notified.length, 0);
});

test("funnel-notificatie: notificatiefout is non-fatal (lead blijft, funnel slaagt)", async () => {
  const { deps, notified } = makeFunnelDeps({
    notifyLead: async () => {
      throw new Error("RESEND_API_ERROR:500");
    },
  });
  const outcome = await maybeRunCustomerZeroOrchestration(INPUT, deps);
  assert.deepEqual(outcome, { ran: true, reason: "ran" }); // assistant-reply onaangetast
  assert.equal(notified.length, 0);
});

test("funnel-notificatie: zonder notifyLead-dep blijft het gedrag ongewijzigd", async () => {
  const { deps } = makeFunnelDeps();
  const withoutNotify: FunnelDeps = {
    hasExistingLead: deps.hasExistingLead,
    runOrchestrator: deps.runOrchestrator,
  };
  const outcome = await maybeRunCustomerZeroOrchestration(INPUT, withoutNotify);
  assert.deepEqual(outcome, { ran: true, reason: "ran" });
});
