import assert from "node:assert/strict";
import { test } from "node:test";

import {
  runCustomerZeroOrchestrator,
  type OrchestratorDeps,
} from "../lib/customer-zero/orchestrator.ts";

interface EventCall {
  eventType: string;
  leadId?: string;
  conversationId?: string;
  messageId?: string;
}

function makeDeps(overrides: Partial<OrchestratorDeps> = {}) {
  const eventCalls: EventCall[] = [];
  const deps: OrchestratorDeps = {
    createLead: async (input) => ({
      leadId: "lead-1",
      conversationId: input.conversationId ?? null,
      status: input.status,
      source: input.source,
      intent: input.intent,
      leadCreatedEventId: "ev-lead-created",
    }),
    createQualification: async () => ({ qualificationId: "qual-1" }),
    recordLeadEvent: async (input) => {
      eventCalls.push({
        eventType: input.eventType,
        leadId: input.leadId,
        conversationId: input.conversationId,
        messageId: input.messageId,
      });
      return "ev-recorded";
    },
    ...overrides,
  };
  return { deps, eventCalls };
}

const HIGH_INTENT_MESSAGES = [
  { role: "user" as const, content: "Ik wil graag een afspraak plannen over de websitesdienst." },
];
const COMMERCIAL_INTENT_MESSAGES = [
  { role: "user" as const, content: "Wij willen meer klanten binnenhalen." },
];
const INFORMATIONAL_MESSAGES = [
  { role: "user" as const, content: "Wat kunnen jullie met AI?" },
];

test("HIGH intent: qualification persisted -> lead_qualified event recorded", async () => {
  const { deps, eventCalls } = makeDeps();
  const result = await runCustomerZeroOrchestrator(
    { conversationId: "conv-1", messages: HIGH_INTENT_MESSAGES, messageId: "msg-1" },
    deps,
  );
  assert.equal(result.leadCreated, true);
  assert.equal(result.qualificationPersisted, true);
  assert.equal(result.qualificationId, "qual-1");
  const qualified = eventCalls.filter((e) => e.eventType === "lead_qualified");
  assert.equal(qualified.length, 1, "lead_qualified must be recorded exactly once on success");
  assert.equal(qualified[0]!.messageId, "msg-1");
});

test("lead_created is recorded exactly once by createLead (no duplicate event)", async () => {
  const { deps, eventCalls } = makeDeps();
  await runCustomerZeroOrchestrator(
    { conversationId: "conv-1", messages: HIGH_INTENT_MESSAGES },
    deps,
  );
  const created = eventCalls.filter((e) => e.eventType === "lead_created");
  assert.equal(created.length, 0, "orchestrator must NOT record lead_created itself");
});

test("qualification persistence failure -> qualificationPersisted:false and NO lead_qualified", async () => {
  const { deps, eventCalls } = makeDeps({
    createQualification: async () => {
      throw new Error("database unavailable");
    },
  });
  const result = await runCustomerZeroOrchestrator(
    { conversationId: "conv-1", messages: HIGH_INTENT_MESSAGES },
    deps,
  );
  assert.equal(result.qualificationPersisted, false);
  assert.equal(result.qualificationId, undefined);
  const qualified = eventCalls.filter((e) => e.eventType === "lead_qualified");
  assert.equal(qualified.length, 0, "lead_qualified must be suppressed when persistence failed");
  // The assistant flow stays non-fatal: the orchestrator resolves normally.
  assert.equal(result.leadCreated, true);
});

test("missing lead_created event id -> qualification skipped, NO lead_qualified", async () => {
  const { deps, eventCalls } = makeDeps({
    createLead: async (input) => ({
      leadId: "lead-1",
      conversationId: input.conversationId ?? null,
      status: input.status,
      source: input.source,
      intent: input.intent,
      leadCreatedEventId: null,
    }),
  });
  const result = await runCustomerZeroOrchestrator(
    { conversationId: "conv-1", messages: HIGH_INTENT_MESSAGES },
    deps,
  );
  assert.equal(result.qualificationPersisted, false);
  assert.equal(eventCalls.filter((e) => e.eventType === "lead_qualified").length, 0);
});

test("COMMERCIAL_INTENT -> lead NEW, no qualification, no lead_qualified", async () => {
  const { deps, eventCalls } = makeDeps();
  const result = await runCustomerZeroOrchestrator(
    { conversationId: "conv-1", messages: COMMERCIAL_INTENT_MESSAGES },
    deps,
  );
  assert.equal(result.leadCreated, true);
  assert.equal(result.qualificationPersisted, false);
  assert.equal(eventCalls.filter((e) => e.eventType === "lead_qualified").length, 0);
  assert.equal(
    eventCalls.filter((e) => e.eventType === "assistant_commercial_intent_detected").length,
    1,
  );
});

test("INFORMATIONAL intent -> no lead, no events", async () => {
  const { deps, eventCalls } = makeDeps();
  const result = await runCustomerZeroOrchestrator(
    { conversationId: "conv-1", messages: INFORMATIONAL_MESSAGES },
    deps,
  );
  assert.equal(result.leadCreated, false);
  assert.equal(eventCalls.length, 0);
});

test("message_id is correlated on the intent event", async () => {
  const { deps, eventCalls } = makeDeps();
  await runCustomerZeroOrchestrator(
    { conversationId: "conv-1", messages: COMMERCIAL_INTENT_MESSAGES, messageId: "msg-42" },
    deps,
  );
  const intentEvent = eventCalls.find((e) => e.eventType === "assistant_commercial_intent_detected");
  assert.equal(intentEvent?.messageId, "msg-42");
});
