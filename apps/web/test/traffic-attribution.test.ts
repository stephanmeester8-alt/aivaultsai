import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_ATTRIBUTION_VALUE_LENGTH,
  classifySource,
  mergeFirstTouch,
  parseClientAttribution,
  sanitizeAttributionValue,
  shouldCaptureAttribution,
  type Attribution,
} from "../lib/traffic/attribution.ts";

// --- source classification ------------------------------------------------

test("google and bing referrers classify as organic", () => {
  assert.equal(classifySource("https://www.google.com/search?q=x", undefined, false), "organic");
  assert.equal(classifySource("https://www.google.nl/", undefined, false), "organic");
  assert.equal(classifySource("https://www.bing.com/search?q=x", undefined, false), "organic");
});

test("social referrers classify as social", () => {
  assert.equal(classifySource("https://www.linkedin.com/feed/", undefined, false), "social");
  assert.equal(classifySource("https://www.facebook.com/", undefined, false), "social");
  assert.equal(classifySource("https://t.co/abc", undefined, false), "social");
  assert.equal(classifySource("https://www.instagram.com/", undefined, false), "social");
});

test("gclid presence classifies as paid", () => {
  assert.equal(classifySource("https://www.google.com/", undefined, true), "paid");
});

test("utm_medium cpc/ppc/paid classify as paid", () => {
  for (const medium of ["cpc", "ppc", "paid", "CPC"]) {
    assert.equal(classifySource(undefined, medium, false), "paid");
  }
});

test("utm_medium organic/social/email classify accordingly", () => {
  assert.equal(classifySource(undefined, "organic", false), "organic");
  assert.equal(classifySource(undefined, "social", false), "social");
  assert.equal(classifySource(undefined, "email", false), "email");
});

test("no referrer and no utm classifies as direct", () => {
  assert.equal(classifySource(undefined, undefined, false), "direct");
  assert.equal(classifySource("", "", false), "direct");
});

test("other external referrer classifies as referral", () => {
  assert.equal(classifySource("https://example.com/", undefined, false), "referral");
});

test("priority order: gclid > utm_medium > referrer", () => {
  // gclid beats utm_medium and referrer
  assert.equal(classifySource("https://www.google.com/", "organic", true), "paid");
  // utm_medium beats referrer
  assert.equal(classifySource("https://www.google.com/", "cpc", false), "paid");
  assert.equal(classifySource("https://www.facebook.com/", "organic", false), "organic");
  assert.equal(classifySource("https://www.google.com/", "social", false), "social");
  // referrer fallback
  assert.equal(classifySource("https://www.google.com/", undefined, false), "organic");
});

// --- sanitization ----------------------------------------------------------

test("referrer query and fragment are stripped (origin + path only)", () => {
  assert.equal(
    sanitizeAttributionValue("referrer_origin", "https://www.google.com/search?q=geheim&x=1#top"),
    "https://www.google.com/search",
  );
});

test("landing_page keeps only the pathname", () => {
  assert.equal(sanitizeAttributionValue("landing_page", "/ai-assistenten?utm_source=x"), "/ai-assistenten");
  assert.equal(sanitizeAttributionValue("landing_page", "https://www.aivaultsai.one/websites"), "/websites");
});

test("values are length-capped", () => {
  const long = "x".repeat(MAX_ATTRIBUTION_VALUE_LENGTH + 100);
  const cleaned = sanitizeAttributionValue("utm_campaign", long);
  assert.equal(cleaned!.length, MAX_ATTRIBUTION_VALUE_LENGTH);
});

test("malformed referrer URL is dropped", () => {
  assert.equal(sanitizeAttributionValue("referrer_origin", "not a url"), null);
  assert.equal(sanitizeAttributionValue("referrer_origin", "javascript:alert(1)"), null);
});

test("unknown keys are removed", () => {
  const result = parseClientAttribution({
    utm_source: "google",
    email: "piet@example.com",
    chat: "geheim bericht",
    evil: "<script>alert(1)</script>",
  });
  assert.deepEqual(Object.keys(result), ["utm_source"]);
});

test("HTML/script payloads are treated as plain data, never executed", () => {
  const result = parseClientAttribution({
    utm_source: "<script>alert(1)</script>",
    utm_campaign: "<img src=x onerror=alert(1)>",
  });
  assert.equal(result.utm_source, "<script>alert(1)</script>");
  assert.equal(result.utm_campaign, "<img src=x onerror=alert(1)>");
});

test("malformed values are dropped without throwing", () => {
  assert.deepEqual(parseClientAttribution(null), {});
  assert.deepEqual(parseClientAttribution("nope"), {});
  assert.deepEqual(parseClientAttribution([1, 2]), {});
  assert.deepEqual(parseClientAttribution({ utm_source: 42 }), {});
  assert.deepEqual(parseClientAttribution({ utm_source: "" }), {});
});

// --- first touch -----------------------------------------------------------

test("first touch is captured on the first request only", () => {
  assert.equal(shouldCaptureAttribution(false), true); // no conversation yet
  assert.equal(shouldCaptureAttribution(true), false); // conversation exists
});

test("existing first-touch values are never overwritten", () => {
  const existing: Attribution = {
    first_touch_source: "organic",
    first_touch_medium: "organic",
    landing_page: "/",
  };
  const incoming: Attribution = {
    first_touch_source: "paid",
    first_touch_medium: "cpc",
    landing_page: "/ai-assistenten",
  };
  const merged = mergeFirstTouch(existing, incoming);
  assert.equal(merged.first_touch_source, "organic");
  assert.equal(merged.first_touch_medium, "organic");
  assert.equal(merged.landing_page, "/ai-assistenten");
});
