/**
 * Deterministic proposal generator (MVP).
 * Proposals are OUTPUT ONLY — never executed by the scanner.
 */

import type { Finding, SeoProposal } from "./types.ts";

interface ProposalTemplate {
  change: string;
  benefit: string;
  risk: string;
  validation: string;
}

const TEMPLATES: Record<string, ProposalTemplate> = {
  MISSING_TITLE: {
    change: "Add a unique, descriptive <title> element (10-60 characters).",
    benefit: "Improves snippet relevance and machine-readable page identity.",
    risk: "Low, provided the title truthfully describes the page.",
    validation: "Re-crawl and assert a non-empty title within 10-60 characters.",
  },
  TITLE_TOO_LONG: {
    change: "Shorten the <title> to 60 characters or fewer.",
    benefit: "Prevents truncation in search results and snippets.",
    risk: "Low.",
    validation: "Re-crawl and assert title length <= 60.",
  },
  TITLE_TOO_SHORT: {
    change: "Expand the <title> to at least 10 descriptive characters.",
    benefit: "Improves relevance signal.",
    risk: "Low.",
    validation: "Re-crawl and assert title length >= 10.",
  },
  MISSING_DESCRIPTION: {
    change: "Add a meta description (<= 160 characters) summarizing the page.",
    benefit: "Improves snippet quality and click-through potential.",
    risk: "Low.",
    validation: "Re-crawl and assert a non-empty description <= 160 characters.",
  },
  DESCRIPTION_TOO_LONG: {
    change: "Shorten the meta description to 160 characters or fewer.",
    benefit: "Prevents truncation in snippets.",
    risk: "Low.",
    validation: "Re-crawl and assert description length <= 160.",
  },
  MISSING_CANONICAL: {
    change: "Add a self-referencing rel=canonical link on the page.",
    benefit: "Removes duplicate-content ambiguity and consolidates signals.",
    risk: "Low, provided the canonical points at the real URL.",
    validation: "Re-crawl and assert canonical equals the page URL.",
  },
  CANONICAL_MISMATCH: {
    change: "Align the rel=canonical value with the actual page URL.",
    benefit: "Prevents search engines from treating the page as a duplicate.",
    risk: "Medium: wrong canonical can hide the page from indexing.",
    validation: "Re-crawl and assert canonical matches the page URL.",
  },
  MISSING_H1: {
    change: "Add exactly one descriptive H1 heading to the page.",
    benefit: "Clarifies the primary topic for machines and users.",
    risk: "Low.",
    validation: "Re-crawl and assert exactly one non-empty H1.",
  },
  MULTIPLE_H1: {
    change: "Reduce to exactly one H1 per page.",
    benefit: "Removes topic ambiguity.",
    risk: "Low.",
    validation: "Re-crawl and assert exactly one H1.",
  },
  HEADING_ORDER_ANOMALY: {
    change: "Fix the heading hierarchy (H1 first, no skipped levels).",
    benefit: "Improves content structure and readability.",
    risk: "Low.",
    validation: "Re-crawl and assert no heading-order anomalies.",
  },
  MISSING_ALT: {
    change: "Add descriptive alt text to images without it.",
    benefit: "Improves image understanding and accessibility.",
    risk: "Low.",
    validation: "Re-crawl and assert every image has alt text.",
  },
  BROKEN_INTERNAL_LINK: {
    change: "Fix or remove internal links that resolve to errors.",
    benefit: "Prevents crawl waste and lost link equity.",
    risk: "Low.",
    validation: "Re-crawl and assert no internal link returns 4xx/5xx.",
  },
  SITEMAP_MISSING: {
    change: "Publish a valid sitemap.xml listing the site's URLs.",
    benefit: "Improves discovery of important pages.",
    risk: "Low.",
    validation: "GET /sitemap.xml and assert well-formed XML with expected URLs.",
  },
  SITEMAP_INVALID: {
    change: "Repair sitemap.xml so it is well-formed XML.",
    benefit: "Ensures sitemap parsing does not fail.",
    risk: "Low.",
    validation: "Parse sitemap.xml and assert validXml = true.",
  },
  SITEMAP_MISMATCH: {
    change: "Add crawled URLs to the sitemap (or remove stale entries).",
    benefit: "Keeps the sitemap aligned with actual site content.",
    risk: "Low.",
    validation: "Compare sitemap URLs with crawled URLs; assert full overlap.",
  },
  ROBOTS_MISSING: {
    change: "Publish a robots.txt allowing crawling and declaring the sitemap.",
    benefit: "Gives search engines explicit crawl guidance.",
    risk: "Medium: a wrong robots.txt can block indexing.",
    validation: "GET /robots.txt and assert 200 with allow rules for the target.",
  },
  ROBOTS_SITEMAP_MISSING: {
    change: "Declare the sitemap in robots.txt.",
    benefit: "Makes sitemap discovery explicit.",
    risk: "Low.",
    validation: "Parse robots.txt and assert a Sitemap declaration exists.",
  },
  ROBOTS_BLOCKS_TARGET: {
    change: "Remove the disallow rule that blocks the target path.",
    benefit: "Restores crawlability and indexability of the target.",
    risk: "High: robots.txt changes affect all crawlers.",
    validation: "Parse robots.txt and assert the target path is not disallowed.",
  },
  STRUCTURED_DATA_MISSING: {
    change: "Add truthful Organization and WebSite JSON-LD (and Product/FAQPage where the content genuinely supports it).",
    benefit: "Improves machine-readable site identity.",
    risk: "Low, provided all claims match verified site information.",
    validation: "Parse JSON-LD and validate required fields against the page content.",
  },
  STRUCTURED_DATA_INVALID: {
    change: "Repair the invalid JSON-LD block(s).",
    benefit: "Prevents broken structured data from being ignored.",
    risk: "Low.",
    validation: "Parse every JSON-LD block and assert valid = true.",
  },
  NOINDEX: {
    change: "Remove the noindex directive from the page that must be indexed.",
    benefit: "Restores indexability.",
    risk: "High: affects indexing directly.",
    validation: "Re-crawl and assert meta robots does not contain noindex.",
  },
  REDIRECT_CHAIN: {
    change: "Replace the redirect chain with a direct redirect to the final URL.",
    benefit: "Reduces crawl overhead and signal loss.",
    risk: "Medium: redirect changes must be tested.",
    validation: "Re-crawl and assert the page is reachable without redirect chains.",
  },
  REDIRECT: {
    change: "Verify the redirect is intentional; prefer serving the final URL directly.",
    benefit: "Simplifies the crawl path.",
    risk: "Low.",
    validation: "Re-crawl and assert zero redirects.",
  },
  SLOW_RESPONSE: {
    change: "Investigate and reduce server response time below 3000ms.",
    benefit: "Improves crawl efficiency and user experience.",
    risk: "Low.",
    validation: "Re-crawl and assert response time below the threshold.",
  },
  HTTP_ERROR: {
    change: "Resolve the server/client error for this URL.",
    benefit: "Prevents crawl waste and user-facing errors.",
    risk: "Low.",
    validation: "Re-crawl and assert HTTP 2xx.",
  },
  OG_IMAGE_MISSING: {
    change: "Add an og:image meta tag with a real, accessible image.",
    benefit: "Improves social and messaging previews.",
    risk: "Low.",
    validation: "Re-crawl and assert og:image is present.",
  },
};

export function generateProposals(findings: readonly Finding[]): SeoProposal[] {
  const proposals: SeoProposal[] = [];
  for (const [index, f] of findings.entries()) {
    const template = TEMPLATES[f.type];
    if (!template) continue;
    proposals.push({
      proposalId: `prop_${index + 1}`,
      findingId: f.id,
      issue: f.claim,
      severity: f.severity,
      affectedUrl: f.url,
      recommendedChange: template.change,
      expectedBenefit: template.benefit,
      risk: template.risk,
      confidence: f.confidence,
      validationMethod: template.validation,
    });
  }
  return proposals;
}
