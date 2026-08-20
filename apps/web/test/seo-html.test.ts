import assert from "node:assert/strict";
import { test } from "node:test";

import {
  analyzeHeadings,
  extractCanonical,
  extractHeadings,
  extractImages,
  extractJsonLd,
  extractLinks,
  extractMeta,
  extractTitle,
} from "../lib/seo/html.ts";

const SAMPLE = `<!doctype html><html lang="nl"><head>
<title>Example — korte titel</title>
<meta name="description" content="Een beschrijving.">
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://example.com/">
<meta property="og:title" content="OG titel">
<meta property="og:image" content="https://example.com/og.png">
<meta name="twitter:card" content="summary_large_image">
</head><body>
<h1>Hoofdtitel</h1><h2>Sectie</h2><h3>Sub</h3>
<a href="/pagina">Interne link</a><a href="https://extern.nl/x">Externe link</a>
<img src="/a.png" alt="afbeelding a"><img src="/b.png">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"AIVaultsAI"}</script>
</body></html>`;

test("extractTitle returns the title text", () => {
  assert.equal(extractTitle(SAMPLE), "Example — korte titel");
});

test("extractMeta returns description, robots and og values", () => {
  assert.equal(extractMeta(SAMPLE, "description"), "Een beschrijving.");
  assert.equal(extractMeta(SAMPLE, "robots"), "index,follow");
  assert.equal(extractMeta(SAMPLE, "og:title"), "OG titel");
  assert.equal(extractMeta(SAMPLE, "og:image"), "https://example.com/og.png");
  assert.equal(extractMeta(SAMPLE, "twitter:card"), "summary_large_image");
  assert.equal(extractMeta(SAMPLE, "missing"), null);
});

test("extractCanonical returns the canonical href", () => {
  assert.equal(extractCanonical(SAMPLE), "https://example.com/");
});

test("extractHeadings collects h1/h2/h3", () => {
  const { h1, h2, h3 } = extractHeadings(SAMPLE);
  assert.deepEqual(h1, ["Hoofdtitel"]);
  assert.deepEqual(h2, ["Sectie"]);
  assert.deepEqual(h3, ["Sub"]);
});

test("analyzeHeadings flags missing and multiple H1", () => {
  assert.ok(analyzeHeadings([], ["x"], []).anomalies.includes("missing-h1"));
  assert.ok(analyzeHeadings(["a", "b"], [], []).anomalies.includes("multiple-h1"));
  assert.equal(analyzeHeadings(["a"], ["b"], ["c"]).anomalies.length, 0);
});

test("extractLinks returns href and anchor text", () => {
  const links = extractLinks(SAMPLE);
  assert.ok(links.some((link) => link.href === "/pagina" && link.text === "Interne link"));
  assert.ok(links.some((link) => link.href === "https://extern.nl/x"));
});

test("extractLinks ignores anchor and javascript links", () => {
  const html = '<a href="#sectie">Anker</a><a href="javascript:void(0)">JS</a><a href="/echt">Echt</a>';
  const links = extractLinks(html);
  assert.equal(links.length, 1);
  assert.equal(links[0]!.href, "/echt");
});

test("extractImages captures alt and missing alt", () => {
  const images = extractImages(SAMPLE);
  assert.equal(images.length, 2);
  assert.equal(images[0]!.alt, "afbeelding a");
  assert.equal(images[1]!.alt, null);
});

test("extractJsonLd parses valid JSON-LD", () => {
  const blocks = extractJsonLd(SAMPLE);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.valid, true);
  assert.equal(blocks[0]!.context, "https://schema.org");
  assert.deepEqual(blocks[0]!.types, ["Organization"]);
});

test("extractJsonLd flags invalid JSON-LD", () => {
  const html = '<script type="application/ld+json">{"broken"</script>';
  const blocks = extractJsonLd(html);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.valid, false);
  assert.notEqual(blocks[0]!.error, null);
});

test("extractJsonLd returns empty for pages without JSON-LD", () => {
  assert.deepEqual(extractJsonLd("<html><body>geen jsonld</body></html>"), []);
});
