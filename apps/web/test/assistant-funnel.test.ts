import assert from "node:assert/strict";
import { test } from "node:test";

import {
  maybeRunCustomerZeroOrchestration,
  type FunnelDeps,
} from "../lib/customer-zero/assistant-funnel.ts";

interface FakeFunnel extends FunnelDeps {
  calls: { conversationId: string; messages: unknown[] }[];
}

function deps(overrides: Partial<FunnelDeps> = {}): FakeFunnel {
  const calls: { conversationId: string; messages: unknown[] }[] = [];
  return {
    hasExistingLead: async () => false,
    runOrchestrator: async (input) => {
      calls.push({ conversationId: input.conversationId, messages: input.messages });
      return {
        intent: { level: "COMMERCIAL_INTENT", detected: true, score: 5, reasons: [] },
        leadCreated: true,
        leadId: "lead-1",
      };
    },
    calls,
    ...overrides,
  };
}

test("runs the orchestrator when no lead exists yet", async () => {
  const d = deps();
  const outcome = await maybeRunCustomerZeroOrchestration(
    { conversationId: "conv-1", messages: [{ role: "user", content: "meer klanten" }] },
    d,
  );
  assert.equal(outcome.ran, true);
  assert.equal(outcome.reason, "ran");
  assert.equal(d.calls.length, 1);
  assert.equal(d.calls[0]!.conversationId, "conv-1");
});

test("skips orchestration when a lead already exists (no duplicate leads)", async () => {
  const d = deps({ hasExistingLead: async () => true });
  const outcome = await maybeRunCustomerZeroOrchestration(
    { conversationId: "conv-1", messages: [] },
    d,
  );
  assert.equal(outcome.ran, false);
  assert.equal(outcome.reason, "lead_exists");
  assert.equal(d.calls.length, 0);
});

test("a failed orchestrator does not throw (non-fatal wiring)", async () => {
  const d = deps({
    runOrchestrator: async () => {
      throw new Error("database unavailable");
    },
  });
  const outcome = await maybeRunCustomerZeroOrchestration(
    { conversationId: "conv-1", messages: [] },
    d,
  );
  assert.equal(outcome.ran, false);
  assert.equal(outcome.reason, "failed");
});

test("a failed lead-exists check does not throw", async () => {
  const d = deps({
    hasExistingLead: async () => {
      throw new Error("database unavailable");
    },
  });
  const outcome = await maybeRunCustomerZeroOrchestration(
    { conversationId: "conv-1", messages: [] },
    d,
  );
  assert.equal(outcome.ran, false);
});

test("messages are passed through to the orchestrator unchanged", async () => {
  const d = deps();
  const messages = [{ role: "user" as const, content: "ik wil een kennismaking plannen" }];
  await maybeRunCustomerZeroOrchestration({ conversationId: "c", messages }, d);
  assert.deepEqual(d.calls[0]!.messages, messages);
});

test("non-commercial intent leaves the flow untouched (orchestrator decides)", async () => {
  const d = deps({
    runOrchestrator: async () => {
      return { intent: { level: "INFORMATIONAL", detected: false, score: 0, reasons: [] }, leadCreated: false };
    },
  });
  const outcome = await maybeRunCustomerZeroOrchestration(
    { conversationId: "conv-1", messages: [{ role: "user", content: "wat kunnen jullie met ai" }] },
    d,
  );
  // The funnel runs the orchestrator; the orchestrator itself decides
  // that no lead is created for non-commercial intent.
  assert.equal(outcome.ran, true);
});
