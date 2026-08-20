/**
 * Transparent SEO health score (MVP).
 *
 * NOT a ranking predictor. Every dimension reports score, coverage and
 * confidence separately. Dimensions without sufficient evidence are
 * excluded from the weighted average (never blindly counted as 0).
 */

import { analyzeHeadings } from "./html.ts";
import { isDisallowed } from "./robots.ts";
import type { Confidence, DimensionScore, PageData, RobotsInfo, SitemapInfo } from "./types.ts";
import { DIMENSIONS, DIMENSION_WEIGHTS } from "./weights.ts";

export interface ScoreInput {
  pages: PageData[];
  robots: RobotsInfo | null;
  sitemap: SitemapInfo | null;
  target: string;
  failedUrls: string[];
}

interface Check {
  label: string;
  pass: boolean | null;
}

function targetPage(pages: readonly PageData[], target: string): PageData | null {
  return pages.find((p) => p.url === target) ?? (pages.length > 0 ? pages[0] : null);
}

function dimensionScore(checks: readonly Check[]): {
  score: number;
  coverage: number;
  confidence: Confidence;
} {
  const evaluated = checks.filter((check) => check.pass !== null);
  const passed = evaluated.filter((check) => check.pass === true).length;
  const coverage =
    checks.length === 0 ? 0 : Math.round((evaluated.length / checks.length) * 100);
  const score = evaluated.length === 0 ? 0 : Math.round((passed / evaluated.length) * 100);
  const confidence: Confidence =
    coverage >= 90 ? "HIGH" : coverage >= 50 ? "MEDIUM" : coverage > 0 ? "LOW" : "UNKNOWN";
  return { score, coverage, confidence };
}

function mergeConfidence(a: Confidence, b: Confidence): Confidence {
  const rank: Record<Confidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, UNKNOWN: 3 };
  return rank[a] >= rank[b] ? a : b;
}

/** Best-effort brand label from the hostname (e.g. www.aivaultsai.one -> aivaultsai). */
export function brandFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    const labels = host.split(".");
    if (labels.length >= 2) return labels[labels.length - 2]!.toLowerCase();
    return labels[0]!.toLowerCase();
  } catch {
    return "";
  }
}

const RELEVANT_SCHEMA_TYPES = [
  "Organization",
  "WebSite",
  "WebPage",
  "SoftwareApplication",
  "Product",
  "Article",
  "BreadcrumbList",
  "FAQPage",
];

function hasRelevantSchemaTypes(page: PageData): boolean {
  const types = new Set(page.jsonLd.flatMap((block) => block.types));
  return RELEVANT_SCHEMA_TYPES.some((type) => types.has(type));
}

function technicalChecks(input: ScoreInput): Check[] {
  const page = targetPage(input.pages, input.target);
  return [
    { label: "robots.txt exists", pass: input.robots?.exists ?? null },
    { label: "sitemap.xml exists", pass: input.sitemap?.exists ?? null },
    {
      label: "no 5xx responses",
      pass:
        input.pages.length === 0
          ? null
          : input.pages.every((p) => p.statusCode === null || p.statusCode < 500),
    },
    {
      label: "no redirect chains",
      pass:
        input.pages.length === 0
          ? null
          : input.pages.every((p) => p.redirects.length < 2),
    },
    { label: "canonical present", pass: page ? page.canonical !== null : null },
  ];
}

function indexabilityChecks(input: ScoreInput): Check[] {
  const page = targetPage(input.pages, input.target);
  const targetPath = new URL(input.target).pathname;
  return [
    {
      label: "target not noindex",
      pass:
        page === null || page.robotsMeta === null
          ? null
          : !/noindex/i.test(page.robotsMeta),
    },
    {
      label: "robots allows target",
      pass:
        input.robots === null
          ? null
          : !isDisallowed(input.robots.rules, targetPath),
    },
    {
      label: "target in sitemap",
      pass: input.sitemap === null ? null : input.sitemap.urls.includes(input.target),
    },
    {
      label: "canonical matches URL",
      pass: page === null || page.canonical === null ? null : page.canonical === page.url,
    },
  ];
}

function contentChecks(input: ScoreInput): Check[] {
  const page = targetPage(input.pages, input.target);
  const anomalies =
    page === null ? [] : analyzeHeadings(page.h1, page.h2, page.h3).anomalies;
  return [
    { label: "title present", pass: page ? page.title !== null : null },
    {
      label: "title length in 10..60",
      pass: page?.title ? page.title.length >= 10 && page.title.length <= 60 : null,
    },
    { label: "description present", pass: page ? page.description !== null : null },
    { label: "exactly one H1", pass: page ? page.h1.length === 1 : null },
    {
      label: "no heading anomalies",
      pass: page === null ? null : !anomalies.includes("first-heading-not-h1") && !anomalies.includes("heading-level-skip"),
    },
    {
      label: "content substance (>300 chars)",
      pass: page ? page.rawLength > 300 : null,
    },
  ];
}

function isSinglePage(input: ScoreInput): boolean {
  return (
    input.pages.length === 1 &&
    input.pages.every((p) => p.internalLinks.length === 0)
  );
}

/**
 * Single-page mode: page-to-page linking is not applicable, so the
 * dimension measures in-page anchor navigation instead. Never a
 * fabricated 100: the score comes from real anchor signals only.
 */
function singlePageLinkingChecks(page: PageData): Check[] {
  const total = page.anchorLinks.length;
  const unique = new Set(page.anchorLinks.map((link) => link.href)).size;
  return [
    { label: "anchor navigation present", pass: total > 0 },
    { label: "anchor breadth (>= 4 unique targets)", pass: unique >= 4 },
    {
      label: "low duplicate anchor ratio",
      pass: total === 0 ? null : unique / total >= 0.8,
    },
  ];
}

function linkingChecks(input: ScoreInput): Check[] {
  const page = targetPage(input.pages, input.target);
  if (isSinglePage(input) && page !== null) {
    return singlePageLinkingChecks(page);
  }
  return [
    { label: "has internal links", pass: page ? page.internalLinks.length > 0 : null },
    { label: "at least 3 internal links", pass: page ? page.internalLinks.length >= 3 : null },
    {
      label: "no broken internal links",
      pass:
        page === null || page.internalLinks.length === 0
          ? null
          : page.internalLinks.every(
              (link) =>
                !input.failedUrls.includes(link.href) &&
                !input.pages.some(
                  (p) => p.url === link.href && p.statusCode !== null && p.statusCode >= 400,
                ),
            ),
    },
  ];
}

function structuredDataChecks(input: ScoreInput): Check[] {
  const page = targetPage(input.pages, input.target);
  return [
    { label: "JSON-LD present", pass: page ? page.jsonLd.length > 0 : null },
    {
      label: "JSON-LD valid",
      pass: page === null || page.jsonLd.length === 0 ? null : page.jsonLd.every((b) => b.valid),
    },
    {
      label: "relevant schema types",
      pass: page === null || page.jsonLd.length === 0 ? null : hasRelevantSchemaTypes(page),
    },
  ];
}

function performanceChecks(input: ScoreInput): Check[] {
  const page = targetPage(input.pages, input.target);
  return [
    {
      label: "response under 3s",
      pass: page === null || page.responseTimeMs === null ? null : page.responseTimeMs < 3000,
    },
    {
      label: "response under 1.5s",
      pass: page === null || page.responseTimeMs === null ? null : page.responseTimeMs < 1500,
    },
    { label: "no redirect on target", pass: page ? page.redirects.length === 0 : null },
  ];
}

function geoAeoChecks(input: ScoreInput): Check[] {
  const page = targetPage(input.pages, input.target);
  const brand = brandFromUrl(input.target);
  return [
    { label: "html lang present", pass: page ? page.htmlLang !== null : null },
    {
      label: "brand in title (entity consistency)",
      pass: page?.title ? page.title.toLowerCase().includes(brand) : null,
    },
    {
      label: "FAQ structure present",
      pass: page ? page.faq.detailsCount > 0 || page.faq.hasFaqId : null,
    },
    { label: "structured data present", pass: page ? page.jsonLd.length > 0 : null },
    { label: "og:title present", pass: page ? page.ogTitle !== null : null },
  ];
}

export function scoreSeo(input: ScoreInput): {
  metrics: DimensionScore[];
  overall: { score: number; coverage: number; confidence: Confidence };
} {
  const computed = new Map<string, { score: number; coverage: number; confidence: Confidence }>();
  computed.set("Technical SEO", dimensionScore(technicalChecks(input)));
  computed.set("Indexability", dimensionScore(indexabilityChecks(input)));
  computed.set("Content", dimensionScore(contentChecks(input)));
  computed.set("Internal Linking", dimensionScore(linkingChecks(input)));
  computed.set("Structured Data", dimensionScore(structuredDataChecks(input)));
  computed.set("Performance", dimensionScore(performanceChecks(input)));
  computed.set("GEO/AEO Readiness", dimensionScore(geoAeoChecks(input)));

  const singlePage = isSinglePage(input);
  const anchorNavigation = input.pages.reduce(
    (sum, p) => sum + p.anchorLinks.length,
    0,
  );
  const pageToPageLinks = input.pages.reduce(
    (sum, p) => sum + p.internalLinks.length,
    0,
  );

  const metrics: DimensionScore[] = DIMENSIONS.map((dimension) => {
    const base: DimensionScore = { dimension, ...computed.get(dimension)! };
    if (dimension === "Internal Linking") {
      return {
        ...base,
        mode: singlePage ? "SINGLE_PAGE" : "MULTI_PAGE",
        anchorNavigation,
        pageToPageLinks,
      };
    }
    return base;
  });

  const included = DIMENSIONS.filter((dimension) => computed.get(dimension)!.coverage > 0);
  const totalWeight = included.reduce((sum, dimension) => sum + DIMENSION_WEIGHTS[dimension], 0);

  const score =
    totalWeight === 0
      ? 0
      : Math.round(
          included.reduce(
            (sum, dimension) =>
              sum + DIMENSION_WEIGHTS[dimension] * computed.get(dimension)!.score,
            0,
          ) / totalWeight,
        );

  const coverage =
    included.length === 0
      ? 0
      : Math.round(
          included.reduce((sum, dimension) => sum + computed.get(dimension)!.coverage, 0) /
            included.length,
        );

  const confidence: Confidence =
    included.length === 0
      ? "UNKNOWN"
      : included.reduce<Confidence>(
          (worst, dimension) => mergeConfidence(worst, computed.get(dimension)!.confidence),
          "HIGH",
        );

  return { metrics, overall: { score, coverage, confidence } };
}
