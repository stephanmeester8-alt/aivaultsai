/**
 * Read-only BFS crawler (MVP).
 * Same-origin scope, depth <= 1 by default, hard URL cap, per-URL
 * error isolation (a failing URL must not fail the whole scan).
 */

import type { PageData, RobotsInfo, SitemapInfo } from "./types.ts";
import { fetchWithPolicy, type FetchDeps, type FetchPolicy, type HttpResult } from "./http.ts";
import {
  detectFaqSignals,
  extractAnchors,
  extractCanonical,
  extractHeadings,
  extractHtmlLang,
  extractImages,
  extractJsonLd,
  extractLinks,
  extractMeta,
  extractTitle,
} from "./html.ts";
import { isDisallowed, parseRobots } from "./robots.ts";
import { parseSitemap } from "./sitemap.ts";
import { sameOrigin, validateUrl } from "./url-policy.ts";

export const DEFAULT_MAX_URLS = 50;
export const DEFAULT_MAX_DEPTH = 1;

export interface CrawlOptions extends FetchPolicy {
  maxUrls?: number;
  maxDepth?: number;
  concurrency?: number;
  deps?: FetchDeps;
  log?: (message: string) => void;
}

export interface CrawlResult {
  pages: PageData[];
  robots: RobotsInfo | null;
  sitemap: SitemapInfo | null;
  failedUrls: string[];
  disallowedUrls: string[];
}

export async function crawlSite(
  targetUrl: string,
  options: CrawlOptions = {},
): Promise<CrawlResult> {
  const maxUrls = options.maxUrls ?? DEFAULT_MAX_URLS;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const concurrency = options.concurrency ?? 4;
  const log = options.log ?? (() => undefined);
  const deps = options.deps ?? {};
  const policy: FetchPolicy = {
    timeoutMs: options.timeoutMs,
    maxResponseBytes: options.maxResponseBytes,
    maxRedirects: options.maxRedirects,
    userAgent: options.userAgent,
  };

  const targetValidation = validateUrl(targetUrl);
  if (!targetValidation.ok) {
    throw new Error(`Invalid target URL: ${targetValidation.reason}`);
  }
  const target = targetValidation.url;
  const origin = target.origin;

  // robots.txt
  const robotsResult = await fetchWithPolicy(`${origin}/robots.txt`, policy, deps);
  const robotsParsed = robotsResult.statusCode === 200 ? parseRobots(robotsResult.body) : null;
  const robots: RobotsInfo = {
    url: `${origin}/robots.txt`,
    statusCode: robotsResult.statusCode,
    exists: robotsResult.statusCode === 200,
    sitemaps: robotsParsed?.sitemaps ?? [],
    rules: robotsParsed?.rules ?? [],
    error: robotsResult.statusCode === 200 ? null : robotsResult.error,
  };
  log(`robots.txt: ${robots.exists ? "found" : "missing"}`);

  // sitemap.xml
  const sitemapResult = await fetchWithPolicy(`${origin}/sitemap.xml`, policy, deps);
  const sitemapParsed = sitemapResult.statusCode === 200 ? parseSitemap(sitemapResult.body) : null;
  const sitemap: SitemapInfo = {
    url: `${origin}/sitemap.xml`,
    statusCode: sitemapResult.statusCode,
    exists: sitemapResult.statusCode === 200,
    validXml: sitemapParsed?.validXml ?? false,
    urls: sitemapParsed?.urls ?? [],
    error: sitemapResult.statusCode === 200 ? null : sitemapResult.error,
  };
  log(`sitemap.xml: ${sitemap.exists ? "found" : "missing"}`);

  // BFS over same-origin pages.
  const pages: PageData[] = [];
  const failedUrls: string[] = [];
  const disallowedUrls: string[] = [];
  const visited = new Set<string>();
  const queued = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: target.toString(), depth: 0 }];
  queued.add(target.toString());
  const robotsRules = robots.rules;

  while (queue.length > 0 && pages.length < maxUrls) {
    const remaining = maxUrls - pages.length;
    const batch = queue
      .splice(0, Math.min(concurrency, remaining))
      .filter((item) => !visited.has(item.url));
    for (const item of batch) visited.add(item.url);

    const results = await Promise.all(
      batch.map(async (item): Promise<{ page: PageData; depth: number } | null> => {
        log(`URL fetched: ${item.url}`);
        const result = await fetchWithPolicy(item.url, policy, deps);
        if (!result.ok || result.statusCode === null) {
          log(`URL failed: ${item.url} (${result.error ?? result.blocked ?? "unknown"})`);
          failedUrls.push(item.url);
          return null;
        }
        return { page: toPageData(item.url, result), depth: item.depth };
      }),
    );

    for (const entry of results) {
      if (entry === null) continue;
      pages.push(entry.page);
      if (entry.depth >= maxDepth) continue;
      for (const link of entry.page.internalLinks) {
        // Fragments (#...) are client-side navigation, never separate
        // crawl resources. Strip them before validation and enqueueing.
        const href = link.href.split("#")[0];
        const linkValidation = validateUrl(href);
        if (!linkValidation.ok) continue;
        if (!sameOrigin(linkValidation.url, target)) continue;
        if (visited.has(href) || queued.has(href)) continue;
        const path = linkValidation.url.pathname + linkValidation.url.search;
        if (isDisallowed(robotsRules, path)) {
          disallowedUrls.push(href);
          continue;
        }
        queued.add(href);
        queue.push({ url: href, depth: entry.depth + 1 });
      }
    }
  }

  return { pages, robots, sitemap, failedUrls, disallowedUrls };
}

function toPageData(url: string, result: HttpResult): PageData {
  const html = result.body;
  const headings = extractHeadings(html);
  const links = extractLinks(html);
  const base = new URL(url);
  const internalLinks: { href: string; text: string }[] = [];
  const externalLinks: { href: string; text: string }[] = [];

  for (const link of links) {
    let resolved: URL;
    try {
      resolved = new URL(link.href, base);
    } catch {
      continue;
    }
    if (resolved.origin === base.origin) {
      internalLinks.push({ href: resolved.toString(), text: link.text });
    } else {
      externalLinks.push({ href: resolved.toString(), text: link.text });
    }
  }

  return {
    url,
    statusCode: result.statusCode,
    contentType: result.contentType,
    responseTimeMs: result.responseTimeMs,
    redirects: result.redirects,
    error: result.error,
    rawLength: html.length,
    htmlLang: extractHtmlLang(html),
    title: extractTitle(html),
    description: extractMeta(html, "description"),
    canonical: extractCanonical(html),
    robotsMeta: extractMeta(html, "robots"),
    ogTitle: extractMeta(html, "og:title"),
    ogDescription: extractMeta(html, "og:description"),
    ogImage: extractMeta(html, "og:image"),
    twitterCard: extractMeta(html, "twitter:card"),
    h1: headings.h1,
    h2: headings.h2,
    h3: headings.h3,
    internalLinks,
    externalLinks,
    anchorLinks: extractAnchors(html),
    images: extractImages(html),
    jsonLd: extractJsonLd(html),
    faq: detectFaqSignals(html),
  };
}
