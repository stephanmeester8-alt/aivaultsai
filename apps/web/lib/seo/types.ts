/**
 * Shared domain types for the read-only SEO scanner.
 *
 * The evidence shape mirrors the EvidenceStore model in
 * packages/agent-core/src/evidence but is kept local on purpose:
 * this package must not depend on agent-core internals (no workspace
 * tooling exists in the repository).
 */

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type EpistemicType = "FACT" | "INFERENCE" | "UNKNOWN";

export interface SeoEvidence {
  sourceType: "crawl" | "robots" | "sitemap" | "html" | "http" | "config";
  signal: string;
  value: unknown;
}

export interface Finding {
  id: string;
  type: string;
  severity: Severity;
  claim: string;
  url: string | null;
  confidence: Confidence;
  epistemicType: EpistemicType;
  evidence: SeoEvidence[];
}

export interface LinkInfo {
  href: string;
  text: string;
}

export interface ImageInfo {
  src: string;
  alt: string | null;
}

export interface JsonLdBlock {
  valid: boolean;
  context: string | null;
  types: string[];
  error: string | null;
}

export interface PageData {
  url: string;
  statusCode: number | null;
  contentType: string | null;
  responseTimeMs: number | null;
  redirects: string[];
  error: string | null;
  rawLength: number;
  htmlLang: string | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterCard: string | null;
  h1: string[];
  h2: string[];
  h3: string[];
  internalLinks: LinkInfo[];
  externalLinks: LinkInfo[];
  /** In-page fragment links (e.g. "#pricing"); navigation signals, never crawl targets. */
  anchorLinks: LinkInfo[];
  images: ImageInfo[];
  jsonLd: JsonLdBlock[];
  faq: { detailsCount: number; hasFaqId: boolean };
}

export interface RobotsRule {
  userAgent: string;
  allow: string[];
  disallow: string[];
}

export interface RobotsInfo {
  url: string;
  statusCode: number | null;
  exists: boolean;
  sitemaps: string[];
  rules: RobotsRule[];
  error: string | null;
}

export interface SitemapInfo {
  url: string;
  statusCode: number | null;
  exists: boolean;
  validXml: boolean;
  urls: string[];
  error: string | null;
}

export interface DimensionScore {
  dimension: string;
  score: number;
  coverage: number;
  confidence: Confidence;
  /** Internal Linking: how the dimension was evaluated. */
  mode?: "SINGLE_PAGE" | "MULTI_PAGE";
  /** Internal Linking: number of in-page anchor links found. */
  anchorNavigation?: number;
  /** Internal Linking: number of page-to-page internal links found. */
  pageToPageLinks?: number;
}

export interface ScanSummary {
  target: string;
  startedAt: string;
  completedAt: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  urlsDiscovered: number;
  urlsScanned: number;
  pageFailures: number;
}

export interface SeoProposal {
  proposalId: string;
  findingId: string;
  issue: string;
  severity: Severity;
  affectedUrl: string | null;
  recommendedChange: string;
  expectedBenefit: string;
  risk: string;
  confidence: Confidence;
  validationMethod: string;
}

export interface SeoReport {
  version: string;
  target: string;
  scan: ScanSummary;
  coverage: { overall: number; confidence: Confidence };
  metrics: DimensionScore[];
  overall: { score: number; coverage: number; confidence: Confidence };
  findings: Finding[];
  proposals: SeoProposal[];
  safety: { readOnly: true; writesPerformed: 0 };
}
