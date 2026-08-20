/**
 * Deterministic findings engine (MVP).
 * Rule: no evidence => no finding. Crawl signals are FACT; derived
 * inconsistencies are INFERENCE; anything unmeasurable is skipped.
 */

import type {
  Confidence,
  Finding,
  PageData,
  RobotsInfo,
  SeoEvidence,
  Severity,
  SitemapInfo,
} from "./types.ts";
import { analyzeHeadings } from "./html.ts";
import { isDisallowed } from "./robots.ts";
import { normalizeUrl, resolveUrl } from "./url-normalization.ts";

export interface AnalyzeInput {
  pages: PageData[];
  robots: RobotsInfo | null;
  sitemap: SitemapInfo | null;
  failedUrls: string[];
  target: string;
}

export const TITLE_MAX_LENGTH = 60;
export const TITLE_MIN_LENGTH = 10;
export const DESCRIPTION_MAX_LENGTH = 160;
export const SLOW_RESPONSE_THRESHOLD_MS = 3000;

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function evidence(sourceType: SeoEvidence["sourceType"], signal: string, value: unknown): SeoEvidence {
  return { sourceType, signal, value };
}

function finding(
  type: string,
  severity: Severity,
  claim: string,
  url: string | null,
  confidence: Confidence,
  epistemicType: "FACT" | "INFERENCE",
  evidenceList: SeoEvidence[],
): Finding {
  const id = `${type}_${url ?? "site"}`;
  return { id, type, severity, claim, url, confidence, epistemicType, evidence: evidenceList };
}

export function analyzeSeo(input: AnalyzeInput): Finding[] {
  const findings: Finding[] = [];
  const { pages, robots, sitemap, failedUrls, target } = input;

  for (const page of pages) {
    const isTarget = page.url === target;

    // HTTP / performance
    if (page.statusCode !== null && page.statusCode >= 500) {
      findings.push(
        finding(
          "HTTP_ERROR",
          "HIGH",
          `Page returned HTTP ${page.statusCode}.`,
          page.url,
          "HIGH",
          "FACT",
          [evidence("http", "statusCode", page.statusCode)],
        ),
      );
    } else if (page.statusCode !== null && page.statusCode >= 400) {
      findings.push(
        finding(
          "HTTP_ERROR",
          "MEDIUM",
          `Page returned HTTP ${page.statusCode}.`,
          page.url,
          "HIGH",
          "FACT",
          [evidence("http", "statusCode", page.statusCode)],
        ),
      );
    }

    if (page.redirects.length >= 2) {
      findings.push(
        finding(
          "REDIRECT_CHAIN",
          isTarget ? "HIGH" : "MEDIUM",
          `Page is reachable through a redirect chain of ${page.redirects.length} hop(s).`,
          page.url,
          "HIGH",
          "FACT",
          [evidence("http", "redirects", page.redirects)],
        ),
      );
    } else if (page.redirects.length === 1) {
      findings.push(
        finding(
          "REDIRECT",
          "LOW",
          "Page responds with a redirect before the final response.",
          page.url,
          "HIGH",
          "FACT",
          [evidence("http", "redirects", page.redirects)],
        ),
      );
    }

    if (page.responseTimeMs !== null && page.responseTimeMs > SLOW_RESPONSE_THRESHOLD_MS) {
      findings.push(
        finding(
          "SLOW_RESPONSE",
          "MEDIUM",
          `Response time ${page.responseTimeMs}ms exceeds ${SLOW_RESPONSE_THRESHOLD_MS}ms.`,
          page.url,
          "HIGH",
          "FACT",
          [evidence("http", "responseTimeMs", page.responseTimeMs)],
        ),
      );
    }

    // Indexability
    if (page.robotsMeta !== null && /noindex/i.test(page.robotsMeta)) {
      findings.push(
        finding(
          "NOINDEX",
          "CRITICAL",
          "Meta robots contains noindex; the page is excluded from indexing.",
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "robotsMeta", page.robotsMeta)],
        ),
      );
    }

    // Metadata
    if (page.title === null) {
      findings.push(
        finding(
          "MISSING_TITLE",
          isTarget ? "HIGH" : "MEDIUM",
          "No <title> element was found.",
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "title", null)],
        ),
      );
    } else if (page.title.length > TITLE_MAX_LENGTH) {
      findings.push(
        finding(
          "TITLE_TOO_LONG",
          "MEDIUM",
          `Title is ${page.title.length} characters (recommended <= ${TITLE_MAX_LENGTH}).`,
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "titleLength", page.title.length)],
        ),
      );
    } else if (page.title.length < TITLE_MIN_LENGTH) {
      findings.push(
        finding(
          "TITLE_TOO_SHORT",
          "LOW",
          `Title is only ${page.title.length} characters.`,
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "titleLength", page.title.length)],
        ),
      );
    }

    if (page.description === null) {
      findings.push(
        finding(
          "MISSING_DESCRIPTION",
          "MEDIUM",
          "No meta description was found.",
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "description", null)],
        ),
      );
    } else if (page.description.length > DESCRIPTION_MAX_LENGTH) {
      findings.push(
        finding(
          "DESCRIPTION_TOO_LONG",
          "MEDIUM",
          `Meta description is ${page.description.length} characters (recommended <= ${DESCRIPTION_MAX_LENGTH}).`,
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "descriptionLength", page.description.length)],
        ),
      );
    }

    if (page.canonical === null) {
      findings.push(
        finding(
          "MISSING_CANONICAL",
          isTarget ? "HIGH" : "MEDIUM",
          "No rel=canonical link was found.",
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "canonical", null)],
        ),
      );
    } else {
      const resolvedCanonical = resolveUrl(page.canonical, page.url);
      if (
        resolvedCanonical !== null &&
        normalizeUrl(resolvedCanonical) !== normalizeUrl(page.url)
      ) {
        findings.push(
          finding(
            "CANONICAL_MISMATCH",
            "MEDIUM",
            `Canonical (${page.canonical}) does not match the page URL (${page.url}).`,
            page.url,
            "HIGH",
            "FACT",
            [evidence("html", "canonical", page.canonical)],
          ),
        );
      }
    }

    if (page.ogImage === null) {
      findings.push(
        finding(
          "OG_IMAGE_MISSING",
          "LOW",
          "No og:image meta was found.",
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "ogImage", null)],
        ),
      );
    }

    // Headings
    if (page.h1.length === 0) {
      findings.push(
        finding(
          "MISSING_H1",
          isTarget ? "HIGH" : "MEDIUM",
          "No H1 heading was found.",
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "h1", [])],
        ),
      );
    }
    if (page.h1.length > 1) {
      findings.push(
        finding(
          "MULTIPLE_H1",
          "MEDIUM",
          `${page.h1.length} H1 headings were found (recommended: exactly 1).`,
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "h1", page.h1)],
        ),
      );
    }
    const { anomalies } = analyzeHeadings(page.h1, page.h2, page.h3);
    if (anomalies.includes("first-heading-not-h1") || anomalies.includes("heading-level-skip")) {
      findings.push(
        finding(
          "HEADING_ORDER_ANOMALY",
          "LOW",
          `Heading hierarchy anomaly detected: ${anomalies.join(", ")}.`,
          page.url,
          "MEDIUM",
          "FACT",
          [evidence("html", "headingAnomalies", anomalies)],
        ),
      );
    }

    // Images
    const missingAltCount = page.images.filter((image) => image.alt === null).length;
    if (missingAltCount > 0) {
      findings.push(
        finding(
          "MISSING_ALT",
          "LOW",
          `${missingAltCount} image(s) without alt text.`,
          page.url,
          "HIGH",
          "FACT",
          [evidence("html", "imagesWithoutAlt", missingAltCount)],
        ),
      );
    }

    // Structured data
    if (page.jsonLd.length === 0) {
      findings.push(
        finding(
          "STRUCTURED_DATA_MISSING",
          "MEDIUM",
          "No JSON-LD structured data was detected on the page.",
          page.url,
          "HIGH",
          "FACT",
          [evidence("crawl", "jsonLd", [])],
        ),
      );
    }
    const invalidJsonLd = page.jsonLd.filter((block) => !block.valid);
    if (invalidJsonLd.length > 0) {
      findings.push(
        finding(
          "STRUCTURED_DATA_INVALID",
          "HIGH",
          `${invalidJsonLd.length} JSON-LD block(s) failed to parse.`,
          page.url,
          "HIGH",
          "FACT",
          [
            evidence("crawl", "jsonLdErrors", invalidJsonLd.map((b) => b.error)),
          ],
        ),
      );
    }

    // Internal links (only when the target was actually fetched)
    const broken = page.internalLinks.filter(
      (link) =>
        failedUrls.includes(link.href) ||
        pages.some(
          (p) => p.url === link.href && p.statusCode !== null && p.statusCode >= 400,
        ),
    );
    if (broken.length > 0) {
      findings.push(
        finding(
          "BROKEN_INTERNAL_LINK",
          "MEDIUM",
          `${broken.length} internal link(s) resolved to an error or 4xx/5xx.`,
          page.url,
          "HIGH",
          "FACT",
          [evidence("crawl", "brokenInternalLinks", broken.map((l) => l.href))],
        ),
      );
    }
  }

  // Site-level: robots.txt
  if (robots === null || !robots.exists) {
    findings.push(
      finding(
        "ROBOTS_MISSING",
        "HIGH",
        "robots.txt is missing or returned an error.",
        robots === null ? null : robots.url,
        "HIGH",
        "FACT",
        [evidence("robots", "exists", robots === null ? null : robots.exists)],
      ),
    );
  } else {
    if (robots.sitemaps.length === 0) {
      findings.push(
        finding(
          "ROBOTS_SITEMAP_MISSING",
          "LOW",
          "robots.txt does not declare a Sitemap.",
          robots.url,
          "HIGH",
          "FACT",
          [evidence("robots", "sitemaps", [])],
        ),
      );
    }
    if (isDisallowed(robots.rules, new URL(target).pathname)) {
      findings.push(
        finding(
          "ROBOTS_BLOCKS_TARGET",
          "CRITICAL",
          "robots.txt disallows crawling of the target path.",
          robots.url,
          "HIGH",
          "FACT",
          [evidence("robots", "rules", robots.rules)],
        ),
      );
    }
  }

  // Site-level: sitemap
  if (sitemap === null || !sitemap.exists) {
    findings.push(
      finding(
        "SITEMAP_MISSING",
        "HIGH",
        "sitemap.xml is missing or returned an error.",
        sitemap === null ? null : sitemap.url,
        "HIGH",
        "FACT",
        [evidence("sitemap", "exists", sitemap === null ? null : sitemap.exists)],
      ),
    );
  } else {
    if (!sitemap.validXml) {
      findings.push(
        finding(
          "SITEMAP_INVALID",
          "HIGH",
          "sitemap.xml is not well-formed XML.",
          sitemap.url,
          "HIGH",
          "FACT",
          [evidence("sitemap", "validXml", false)],
        ),
      );
    } else {
      const normalizedSitemapUrls = new Set(sitemap.urls.map((u) => normalizeUrl(u)));
      const discovered = pages.map((p) => p.url);
      const missingFromSitemap = discovered.filter(
        (u) => !normalizedSitemapUrls.has(normalizeUrl(u)),
      );
      if (missingFromSitemap.length > 0) {
        findings.push(
          finding(
            "SITEMAP_MISMATCH",
            "LOW",
            `${missingFromSitemap.length} crawled URL(s) are not listed in the sitemap.`,
            sitemap.url,
            "MEDIUM",
            "INFERENCE",
            [evidence("sitemap", "urls", sitemap.urls)],
          ),
        );
      }
    }
  }

  findings.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id),
  );
  return findings;
}
