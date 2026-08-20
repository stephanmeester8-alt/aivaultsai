import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeSeo } from "../lib/seo/findings.ts";
import type { PageData, RobotsInfo, SitemapInfo } from "../lib/seo/types.ts";

const TARGET = "https://www.example.com/";

function page(overrides: Partial<PageData> = {}): PageData {
  return {
    url: TARGET,
    statusCode: 200,
    contentType: "text/html",
    responseTimeMs: 200,
    redirects: [],
    error: null,
    rawLength: 5000,
    htmlLang: "nl",
    title: "Voorbeeldpagina",
    description: "Een beschrijving.",
    canonical: TARGET,
    robotsMeta: "index,follow",
    ogTitle: "Voorbeeldpagina",
    ogDescription: "Een beschrijving.",
    ogImage: "https://www.example.com/og.png",
    twitterCard: "summary_large_image",
    h1: ["Titel"],
    h2: ["Sectie"],
    h3: [],
    internalLinks: [],
    externalLinks: [],
    anchorLinks: [],
    images: [],
    jsonLd: [
      { valid: true, context: "https://schema.org", types: ["Organization"], error: null },
    ],
    faq: { detailsCount: 0, hasFaqId: false },
    ...overrides,
  };
}

const robots: RobotsInfo = {
  url: "https://www.example.com/robots.txt",
  statusCode: 200,
  exists: true,
  sitemaps: ["https://www.example.com/sitemap.xml"],
  rules: [{ userAgent: "*", allow: ["/"], disallow: [] }],
  error: null,
};

const sitemap: SitemapInfo = {
  url: "https://www.example.com/sitemap.xml",
  statusCode: 200,
  exists: true,
  validXml: true,
  urls: [TARGET],
  error: null,
};

function analyze(
  pages: PageData[],
  robotsOverride: RobotsInfo | null = robots,
  sitemapOverride: SitemapInfo | null = sitemap,
  failedUrls: string[] = [],
) {
  return analyzeSeo({ pages, robots: robotsOverride, sitemap: sitemapOverride, failedUrls, target: TARGET });
}

test("every finding carries id, type, severity, claim, confidence and evidence", () => {
  const findings = analyze([page({ title: null, images: [{ src: "/a.png", alt: null }] })]);
  assert.ok(findings.length > 0);
  for (const f of findings) {
    assert.equal(typeof f.id, "string");
    assert.equal(typeof f.type, "string");
    assert.ok(["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(f.severity));
    assert.equal(typeof f.claim, "string");
    assert.ok(["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(f.confidence));
    assert.ok(["FACT", "INFERENCE"].includes(f.epistemicType));
    assert.ok(f.evidence.length > 0, `finding ${f.type} must carry evidence`);
  }
});

test("a healthy page produces no metadata findings", () => {
  const findings = analyze([page()]);
  const types = findings.map((f) => f.type);
  for (const unwanted of [
    "MISSING_TITLE",
    "TITLE_TOO_LONG",
    "TITLE_TOO_SHORT",
    "MISSING_DESCRIPTION",
    "DESCRIPTION_TOO_LONG",
    "MISSING_CANONICAL",
    "CANONICAL_MISMATCH",
    "MISSING_H1",
    "MULTIPLE_H1",
    "MISSING_ALT",
    "STRUCTURED_DATA_MISSING",
    "STRUCTURED_DATA_INVALID",
    "SITEMAP_MISSING",
    "ROBOTS_MISSING",
  ]) {
    assert.equal(types.includes(unwanted), false, unwanted);
  }
});

test("missing title on the target page is HIGH", () => {
  const findings = analyze([page({ title: null })]);
  const f = findings.find((x) => x.type === "MISSING_TITLE");
  assert.ok(f);
  assert.equal(f.severity, "HIGH");
  assert.equal(f.epistemicType, "FACT");
});

test("noindex is CRITICAL", () => {
  const findings = analyze([page({ robotsMeta: "noindex, nofollow" })]);
  const f = findings.find((x) => x.type === "NOINDEX");
  assert.ok(f);
  assert.equal(f.severity, "CRITICAL");
});

test("multiple H1 is detected", () => {
  const findings = analyze([page({ h1: ["Een", "Twee"] })]);
  assert.ok(findings.some((f) => f.type === "MULTIPLE_H1"));
});

test("missing alt is detected with a count", () => {
  const findings = analyze([
    page({
      images: [
        { src: "/a.png", alt: null },
        { src: "/b.png", alt: "b" },
      ],
    }),
  ]);
  const f = findings.find((x) => x.type === "MISSING_ALT");
  assert.ok(f);
  assert.equal(f.evidence[0]!.signal, "imagesWithoutAlt");
  assert.equal(f.evidence[0]!.value, 1);
});

test("invalid JSON-LD is HIGH", () => {
  const findings = analyze([
    page({
      jsonLd: [{ valid: false, context: null, types: [], error: "Unexpected token" }],
    }),
  ]);
  const f = findings.find((x) => x.type === "STRUCTURED_DATA_INVALID");
  assert.ok(f);
  assert.equal(f.severity, "HIGH");
});

test("missing sitemap is HIGH", () => {
  const findings = analyze([page()], robots, null);
  assert.ok(findings.some((f) => f.type === "SITEMAP_MISSING" && f.severity === "HIGH"));
});

test("robots.txt blocking the target is CRITICAL", () => {
  const blockingRobots: RobotsInfo = {
    ...robots,
    rules: [{ userAgent: "*", allow: [], disallow: ["/"] }],
  };
  const findings = analyze([page()], blockingRobots, sitemap);
  assert.ok(findings.some((f) => f.type === "ROBOTS_BLOCKS_TARGET" && f.severity === "CRITICAL"));
});

test("no evidence => no broken-link finding", () => {
  const findings = analyze([
    page({ internalLinks: [{ href: "https://www.example.com/nooit-gecrawld", text: "x" }] }),
  ]);
  assert.equal(findings.some((f) => f.type === "BROKEN_INTERNAL_LINK"), false);
});

test("findings are sorted by severity", () => {
  const findings = analyze([
    page({
      title: null,
      robotsMeta: "noindex",
      images: [{ src: "/a.png", alt: null }],
    }),
  ]);
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  for (let i = 1; i < findings.length; i += 1) {
    assert.ok(
      order[findings[i - 1]!.severity] <= order[findings[i]!.severity],
      "findings must be severity-ordered",
    );
  }
});

test("canonical with only a trailing-slash difference is NOT a mismatch", () => {
  const findings = analyze([page({ canonical: "https://www.example.com" })]);
  assert.equal(findings.some((f) => f.type === "CANONICAL_MISMATCH"), false);
});

test("canonical pointing to a different path IS a mismatch", () => {
  const findings = analyze([page({ canonical: "https://www.example.com/other" })]);
  const f = findings.find((x) => x.type === "CANONICAL_MISMATCH");
  assert.ok(f);
  assert.equal(f.severity, "MEDIUM");
});

test("sitemap with only a trailing-slash difference is NOT a mismatch", () => {
  const slashless: SitemapInfo = { ...sitemap, urls: ["https://www.example.com"] };
  const findings = analyze([page()], robots, slashless);
  assert.equal(findings.some((f) => f.type === "SITEMAP_MISMATCH"), false);
});

test("a genuinely missing sitemap URL is still a mismatch", () => {
  const missingUrl: SitemapInfo = { ...sitemap, urls: ["https://www.example.com/other"] };
  const findings = analyze([page()], robots, missingUrl);
  assert.ok(findings.some((f) => f.type === "SITEMAP_MISMATCH"));
});
