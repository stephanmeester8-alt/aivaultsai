/**
 * SEO scanner orchestrator (MVP, read-only).
 *
 * FAILED only when the scan cannot start or no page data was collected;
 * partial page failures yield PARTIAL, never FAILED.
 */

import { crawlSite } from "./crawler.ts";
import { analyzeSeo } from "./findings.ts";
import { generateProposals } from "./proposals.ts";
import { REPORT_VERSION } from "./report.ts";
import { scoreSeo } from "./scoring.ts";
import type { SeoReport } from "./types.ts";
import { validateUrl } from "./url-policy.ts";
import type { FetchDeps } from "./http.ts";

export interface ScanRunOptions {
  url: string;
  maxUrls?: number;
  maxDepth?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  deps?: FetchDeps;
  log?: (message: string) => void;
}

export async function runSeoScan(options: ScanRunOptions): Promise<SeoReport> {
  const log = options.log ?? ((message: string) => console.log(message));
  const startedAt = new Date().toISOString();
  log("scan started");

  const validation = validateUrl(options.url);
  if (!validation.ok) {
    throw new Error(`Invalid target URL: ${validation.reason}`);
  }
  const target = validation.url.toString();

  const crawl = await crawlSite(target, {
    maxUrls: options.maxUrls,
    maxDepth: options.maxDepth,
    timeoutMs: options.timeoutMs,
    maxResponseBytes: options.maxResponseBytes,
    maxRedirects: options.maxRedirects,
    deps: options.deps,
    log,
  });

  const findings = analyzeSeo({
    pages: crawl.pages,
    robots: crawl.robots,
    sitemap: crawl.sitemap,
    failedUrls: crawl.failedUrls,
    target,
  });

  const { metrics, overall } = scoreSeo({
    pages: crawl.pages,
    robots: crawl.robots,
    sitemap: crawl.sitemap,
    target,
    failedUrls: crawl.failedUrls,
  });

  const proposals = generateProposals(findings);

  const status =
    crawl.pages.length === 0 ? "FAILED" : crawl.failedUrls.length > 0 ? "PARTIAL" : "SUCCESS";

  log(`scan completed (${status})`);

  return {
    version: REPORT_VERSION,
    target,
    scan: {
      target,
      startedAt,
      completedAt: new Date().toISOString(),
      status,
      urlsDiscovered: crawl.pages.length + crawl.failedUrls.length,
      urlsScanned: crawl.pages.length,
      pageFailures: crawl.failedUrls.length,
    },
    coverage: { overall: overall.coverage, confidence: overall.confidence },
    metrics,
    overall,
    findings,
    proposals,
    safety: { readOnly: true, writesPerformed: 0 },
  };
}
