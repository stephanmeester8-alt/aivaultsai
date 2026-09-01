import assert from "node:assert/strict";
import { test } from "node:test";

import { detectAiAssistant } from "../lib/prospect-run/ai-detection.ts";

const PAGE = "https://www.acme.nl";

test("YES: intercom script signatures are detected with evidence", () => {
  const html = `
    <html><head><script>window.intercomSettings = { app_id: "abc" };</script>
    <script src="https://widget.intercom.io/widget/abc"></script></head>
    <body><h1>Acme BV</h1><p>Wij leveren kwaliteit sinds 1998 en staan voor u klaar.</p></body></html>`;
  const result = detectAiAssistant(html, PAGE);
  assert.equal(result.status, "yes");
  assert.ok(result.confidence >= 0.9 && result.confidence <= 0.98);
  assert.ok(result.detectedTechnologies.includes("Intercom"));
  assert.ok(result.evidence.some((e) => e.type === "chat_provider_script"));
  assert.deepEqual(result.checkedPages, [PAGE]);
});

test("YES: tidio script signature is detected", () => {
  const html = '<html><body><script src="//code.tidio.co/abc123.js"></script><p>content</p></body></html>';
  const result = detectAiAssistant(html, PAGE);
  assert.equal(result.status, "yes");
  assert.ok(result.detectedTechnologies.includes("Tidio"));
});

test("YES: chat widget iframe is detected as a strong signal", () => {
  const html = '<html><body><iframe src="https://chatbase.co/embed/xyz"></iframe><p>content</p></body></html>';
  const result = detectAiAssistant(html, PAGE);
  assert.equal(result.status, "yes");
  assert.ok(result.detectedTechnologies.includes("Chatbase"));
  assert.ok(result.evidence.some((e) => e.type === "chat_widget_iframe"));
});

test("YES: DOM launcher markers count as strong evidence", () => {
  const html = '<html><body><div class="intercom-launcher"></div><p>content</p></body></html>';
  const result = detectAiAssistant(html, PAGE);
  assert.equal(result.status, "yes");
  assert.ok(result.evidence.some((e) => e.type === "chat_dom_marker"));
});

test("NO: plain page with sufficient content yields NO with absence evidence", () => {
  const html = `<html><head><title>Acme BV</title></head><body>
    <h1>Acme BV</h1>
    <p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies op maat.
    Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies op maat.
    Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies op maat.
    Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies op maat.
    Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies op maat.
    Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies op maat.</p>
  </body></html>`;
  const result = detectAiAssistant(html, PAGE);
  assert.equal(result.status, "no");
  assert.equal(result.confidence, 0.6);
  assert.ok(result.evidence.some((e) => e.type === "absence"));
});

test("UNKNOWN: tiny page without signals cannot conclude", () => {
  const result = detectAiAssistant("<html><body>Hi</body></html>", PAGE);
  assert.equal(result.status, "unknown");
  assert.equal(result.confidence, 0.3);
  assert.ok(result.evidence.some((e) => e.type === "insufficient_content"));
});

test("UNKNOWN: visible chat copy alone never produces YES", () => {
  const html = `<html><body><p>Chat with us! Wij staan voor u klaar. Bel of mail ons gerust.
  Chat with us! Wij staan voor u klaar. Bel of mail ons gerust. Chat with us!</p></body></html>`;
  const result = detectAiAssistant(html, PAGE);
  assert.equal(result.status, "unknown");
  assert.ok(result.evidence.some((e) => e.type === "chat_visible_text"));
  assert.ok(result.confidence < 0.7);
});

test("confidence stays within bounds for multiple strong signals", () => {
  const html = `<html><head>
    <script src="https://widget.intercom.io/widget/abc"></script>
    <script src="//code.tidio.co/xyz.js"></script>
    </head><body><div class="intercom-launcher"></div><p>content</p></body></html>`;
  const result = detectAiAssistant(html, PAGE);
  assert.equal(result.status, "yes");
  assert.ok(result.confidence >= 0.9 && result.confidence <= 0.98);
  assert.ok(result.detectedTechnologies.length >= 2);
});

test("detection never throws on malformed input", () => {
  const result = detectAiAssistant("", PAGE);
  assert.equal(result.status, "unknown");
  const weird = detectAiAssistant("<html><body><script>undefined</script></body></html>", PAGE);
  assert.ok(["yes", "no", "unknown"].includes(weird.status));
});
