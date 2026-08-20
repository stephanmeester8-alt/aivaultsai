import assert from "node:assert/strict";
import { test } from "node:test";

import { brandFromUrl, scoreSeo } from "../lib/seo/scoring.ts";
import { DIMENSIONS } from "../lib/seo/weights.ts";
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
    title: "Voorbeeldpagina van example",
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
    internalLinks: [{ href: "https://www.example.com/over", text: "Over" }],
    externalLinks: [],
    anchorLinks: [
      { href: "#a", text: "A" },
      { href: "#b", text: "B" },
      { href: "#c", text: "C" },
      { href: "#d", text: "D" },
      { href: "#e", text: "E" },
    ],
    images: [],
    jsonLd: [
      { valid: true, context: "https://schema.org", types: ["Organization"], error: null },
    ],
    faq: { detailsCount: 5, hasFaqId: true },
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

function score(pages: PageData[]) {
  return scoreSeo({ pages, robots, sitemap, target: TARGET, failedUrls: [] });
}

test("scoring is deterministic", () => {
  const a = score([page()]);
  const b = score([page()]);
  assert.deepEqual(a, b);
});

test("all seven dimensions are reported with valid ranges", () => {
  const { metrics } = score([page()]);
  assert.equal(metrics.length, 7);
  for (const dimension of DIMENSIONS) {
    const metric = metrics.find((m) => m.dimension === dimension);
    assert.ok(metric, dimension);
    assert.ok(metric.score >= 0 && metric.score <= 100, `${dimension} score`);
    assert.ok(metric.coverage >= 0 && metric.coverage <= 100, `${dimension} coverage`);
  }
});

test("missing data yields UNKNOWN confidence and zero coverage, not a fake score", () => {
  const { metrics, overall } = scoreSeo({
    pages: [],
    robots: null,
    sitemap: null,
    target: TARGET,
    failedUrls: [],
  });
  assert.equal(overall.coverage, 0);
  assert.equal(overall.confidence, "UNKNOWN");
  for (const metric of metrics) {
    assert.equal(metric.coverage, 0);
    assert.equal(metric.confidence, "UNKNOWN");
  }
});

test("a degraded page scores lower than a healthy page", () => {
  const healthy = score([page()]).overall;
  const degraded = score([
    page({
      title: null,
      description: null,
      canonical: null,
      h1: [],
      responseTimeMs: 9000,
      redirects: ["/a", "/b"],
      robotsMeta: "noindex",
      images: [{ src: "/a.png", alt: null }],
    }),
  ]).overall;
  assert.ok(degraded.score < healthy.score);
});

test("coverage drops when performance data is missing", () => {
  const withTime = score([page()]).metrics;
  const withoutTime = score([page({ responseTimeMs: null })]).metrics;
  const perfWith = withTime.find((m) => m.dimension === "Performance")!;
  const perfWithout = withoutTime.find((m) => m.dimension === "Performance")!;
  assert.ok(perfWithout.coverage < perfWith.coverage);
});

test("weighted average is bounded and non-negative", () => {
  const { overall } = score([page()]);
  assert.ok(overall.score >= 0 && overall.score <= 100);
  assert.ok(overall.coverage >= 0 && overall.coverage <= 100);
});

test("brandFromUrl derives the brand label", () => {
  assert.equal(brandFromUrl("https://www.aivaultsai.one"), "aivaultsai");
  assert.equal(brandFromUrl("https://aivaultsai.one"), "aivaultsai");
});

// --- Internal linking: single-page vs multi-page (FIX-002) ----------------

function anchors(n: number, prefix = "#anchor"): { href: string; text: string }[] {
  return Array.from({ length: n }, (_, i) => ({
    href: `${prefix}${i + 1}`,
    text: `${prefix}${i + 1}`,
  }));
}

function linkingMetric(pages: PageData[]) {
  const { metrics } = scoreSeo({ pages, robots, sitemap, target: TARGET, failedUrls: [] });
  return metrics.find((m) => m.dimension === "Internal Linking")!;
}

function singlePageInput(overrides: Partial<PageData> = {}) {
  return [page({ internalLinks: [], anchorLinks: anchors(10), ...overrides })];
}

test("Case 1: single-page with 10 unique anchors is NOT 0/100", () => {
  const linking = linkingMetric(singlePageInput());
  assert.ok(linking.score > 0, `score should not be 0, got ${linking.score}`);
  assert.equal(linking.mode, "SINGLE_PAGE");
  assert.equal(linking.anchorNavigation, 10);
  assert.equal(linking.pageToPageLinks, 0);
});

test("Case 2: single-page without anchors scores low, not a fabricated 100", () => {
  const linking = linkingMetric(singlePageInput({ anchorLinks: [] }));
  assert.ok(linking.score < 50, `got ${linking.score}`);
  assert.ok(linking.coverage < 100, "coverage must reflect missing anchor data");
  assert.equal(linking.mode, "SINGLE_PAGE");
});

test("Case 3: multi-page sites are assessed with page-to-page links", () => {
  const pageA = page({
    url: "https://www.example.com/page-a",
    internalLinks: [
      { href: "https://www.example.com/page-b", text: "B" },
      { href: "https://www.example.com/page-c", text: "C" },
    ],
  });
  const pageB = page({
    url: "https://www.example.com/page-b",
    internalLinks: [{ href: "https://www.example.com/page-a", text: "A" }],
  });
  const pageC = page({
    url: "https://www.example.com/page-c",
    internalLinks: [{ href: "https://www.example.com/page-a", text: "A" }],
  });
  const linking = linkingMetric([pageA, pageB, pageC]);
  assert.equal(linking.mode, "MULTI_PAGE");
  assert.ok(linking.score > 0, `got ${linking.score}`);
  assert.equal(linking.pageToPageLinks, 4);
});

test("Case 4: duplicate anchors count once for uniqueness", () => {
  const duplicates = [
    { href: "#contact", text: "Contact" },
    { href: "#contact", text: "Contact" },
    { href: "#contact", text: "Contact" },
  ];
  const linking = linkingMetric(singlePageInput({ anchorLinks: duplicates }));
  assert.equal(linking.anchorNavigation, 3);
  assert.equal(linking.score, 33);
});

test("Case 5: external links are never counted as internal linking", () => {
  const linking = linkingMetric(
    singlePageInput({
      anchorLinks: [],
      externalLinks: [{ href: "https://google.com", text: "Google" }],
    }),
  );
  assert.equal(linking.pageToPageLinks, 0);
  assert.equal(linking.mode, "SINGLE_PAGE");
  assert.ok(linking.score < 50);
});

// --- Indexability normalization (TASK 13) ----------------------------------

function indexabilityMetric(
  pages: PageData[],
  sitemapOverride: SitemapInfo,
  canonicalOverride?: string,
) {
  const overridden = canonicalOverride
    ? pages.map((p) => ({ ...p, canonical: canonicalOverride }))
    : pages;
  const { metrics } = scoreSeo({
    pages: overridden,
    robots,
    sitemap: sitemapOverride,
    target: TARGET,
    failedUrls: [],
  });
  return metrics.find((m) => m.dimension === "Indexability")!;
}

test("indexability: sitemap with trailing-slash difference still matches", () => {
  const slashless: SitemapInfo = { ...sitemap, urls: ["https://www.example.com"] };
  const metric = indexabilityMetric([page()], slashless);
  assert.equal(metric.score, 100);
});

test("indexability: canonical with trailing-slash difference still matches", () => {
  const metric = indexabilityMetric([page()], sitemap, "https://www.example.com");
  assert.equal(metric.score, 100);
});

test("indexability: a genuinely different canonical still fails", () => {
  const metric = indexabilityMetric([page()], sitemap, "https://www.example.com/other");
  assert.equal(metric.score, 75);
});

test("indexability: a sitemap missing the target still fails", () => {
  const missing: SitemapInfo = { ...sitemap, urls: ["https://www.example.com/other"] };
  const metric = indexabilityMetric([page()], missing);
  assert.equal(metric.score, 75);
});
