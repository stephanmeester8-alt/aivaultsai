import assert from "node:assert/strict";
import { test } from "node:test";

import {
  recordLeadEvent,
  type LeadEventSql,
} from "../lib/customer-zero/persistence/lead-events.ts";

interface RecordedCall {
  leadId: unknown;
  conversationId: unknown;
  eventType: string;
  source: string;
  origin: string;
}

function fakeSql(): { sql: LeadEventSql; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const sql: LeadEventSql = async (_strings, ...values) => {
    calls.push({
      leadId: values[0],
      conversationId: values[1],
      eventType: String(values[2]),
      source: String(values[3]),
      origin: String(values[4]),
    });
    return [];
  };
  return { sql, calls };
}

test("records an assistant commercial intent event", async () => {
  const { sql, calls } = fakeSql();
  await recordLeadEvent(sql, {
    conversationId: "conv-1",
    eventType: "assistant_commercial_intent_detected",
    source: "ai_assistant",
    origin: "live_assistant",
    metadata: { commercialIntentLevel: "HIGH_COMMERCIAL_INTENT", commercialIntentScore: 9 },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.eventType, "assistant_commercial_intent_detected");
  assert.equal(calls[0]!.source, "ai_assistant");
  assert.equal(calls[0]!.origin, "live_assistant");
  assert.equal(calls[0]!.conversationId, "conv-1");
});

test("records a lead created event with lead id", async () => {
  const { sql, calls } = fakeSql();
  await recordLeadEvent(sql, {
    leadId: "lead-1",
    eventType: "lead_created",
    source: "ai_assistant",
    origin: "live_assistant",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.eventType, "lead_created");
  assert.equal(calls[0]!.leadId, "lead-1");
});

test("records a lead qualified event", async () => {
  const { sql, calls } = fakeSql();
  await recordLeadEvent(sql, {
    leadId: "lead-1",
    conversationId: "conv-1",
    eventType: "lead_qualified",
    source: "ai_assistant",
    origin: "live_assistant",
    metadata: { qualifiedBy: "customer_zero_orchestrator" },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.eventType, "lead_qualified");
});

test("emits exactly one insert per invocation (no duplicates)", async () => {
  const { sql, calls } = fakeSql();
  await recordLeadEvent(sql, { eventType: "lead_created", source: "x", origin: "manual" });
  assert.equal(calls.length, 1);
  await recordLeadEvent(sql, { eventType: "lead_created", source: "x", origin: "manual" });
  assert.equal(calls.length, 2);
});

test("undefined ids are written as null (nullable FK columns)", async () => {
  const { sql, calls } = fakeSql();
  await recordLeadEvent(sql, {
    conversationId: "conv-1",
    eventType: "assistant_commercial_intent_detected",
    source: "ai_assistant",
    origin: "live_assistant",
  });
  assert.equal(calls[0]!.leadId, null);
});

test("a failed event write does not corrupt the flow", async () => {
  const throwing: LeadEventSql = async () => {
    throw new Error("database unavailable");
  };
  await recordLeadEvent(throwing, {
    eventType: "lead_created",
    source: "ai_assistant",
    origin: "live_assistant",
  });
  // Must resolve without throwing: events register, they never decide.
  assert.ok(true);
});
