import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GA_EVENTS,
  buildGtagInitScript,
  buildServerEventPayload,
  fireFunnelAnalytics,
  ga4ConsentDefaults,
  hashId,
  isAnalyticsConfigured,
} from "../lib/analytics/gtag.ts";
import type { CustomerZeroResult } from "../lib/customer-zero/orchestrator.ts";

test("the five required GA4 events are defined", () => {
  assert.deepEqual([...GA_EVENTS], [
    "assistant_started",
    "commercial_intent_detected",
    "lead_created",
    "lead_qualified",
    "appointment_requested",
  ]);
});

test("analytics is configured only with a measurement id", () => {
  assert.equal(isAnalyticsConfigured({}), false);
  assert.equal(isAnalyticsConfigured({ GA_MEASUREMENT_ID: "G-X" }), false, "server id alone is not enough for client");
  assert.equal(isAnalyticsConfigured({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-ABC" }), true);
});

test("consent defaults are all denied", () => {
  const defaults = ga4ConsentDefaults();
  assert.deepEqual(defaults, {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
});

test("hashId is deterministic, short and hex", () => {
  assert.equal(hashId("conv-1"), hashId("conv-1"));
  assert.match(hashId("conv-1"), /^[0-9a-f]{12}$/);
  assert.notEqual(hashId("conv-1"), hashId("conv-2"));
});

test("server event payload contains only the provided hashed params", () => {
  const payload = buildServerEventPayload("lead_created", {
    conversation_id: hashId("conv-1"),
    lead_id: hashId("lead-1"),
  }) as { client_id: string; events: { name: string; params: Record<string, unknown> }[] };
  assert.equal(payload.client_id, "aivaultsai-server");
  assert.equal(payload.events.length, 1);
  assert.equal(payload.events[0]!.name, "lead_created");
  assert.deepEqual(Object.keys(payload.events[0]!.params).sort(), ["conversation_id", "lead_id"]);
});

test("gtag init script sets consent defaults and a sanitized config id", () => {
  const script = buildGtagInitScript("G-ABC123");
  assert.ok(script.includes("analytics_storage:'denied'"));
  assert.ok(script.includes("ad_personalization:'denied'"));
  assert.ok(script.includes("gtag('config','G-ABC123');"));
  // Script-breaking characters in the id are stripped.
  const sanitized = buildGtagInitScript('G-X";alert(1)//');
  assert.ok(!sanitized.includes("alert(1)"));
  assert.ok(!sanitized.includes('";'));
});

test("fireFunnelAnalytics is a safe no-op without GA env (never throws)", async () => {
  const result: CustomerZeroResult = {
    intent: { level: "HIGH_COMMERCIAL_INTENT", detected: true, score: 9, reasons: [] },
    leadCreated: true,
    leadId: "lead-1",
  };
  await fireFunnelAnalytics("conv-1", result);
  const informational: CustomerZeroResult = {
    intent: { level: "INFORMATIONAL", detected: false, score: 0, reasons: [] },
    leadCreated: false,
  };
  await fireFunnelAnalytics("conv-1", informational);
  assert.ok(true);
});
