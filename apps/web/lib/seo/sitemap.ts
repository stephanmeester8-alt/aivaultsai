/**
 * Minimal sitemap.xml parser (MVP).
 * Well-formedness is checked heuristically (root tag present, balanced);
 * URLs are collected from <loc> elements.
 */

export interface SitemapParseResult {
  validXml: boolean;
  urls: string[];
  kind: "urlset" | "sitemapindex" | "unknown";
}

export function parseSitemap(xml: string): SitemapParseResult {
  const trimmed = xml.trim();
  const isUrlset = /<urlset\b/i.test(trimmed) && /<\/urlset>/i.test(trimmed);
  const isIndex = /<sitemapindex\b/i.test(trimmed) && /<\/sitemapindex>/i.test(trimmed);
  const startsWell =
    /^(<\?xml[\s\S]*?\?>\s*)?<(urlset|sitemapindex)\b/i.test(trimmed);

  const urls: string[] = [];
  for (const match of trimmed.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    const value = match[1]!.trim();
    if (value !== "") urls.push(value);
  }

  const kind = isUrlset ? "urlset" : isIndex ? "sitemapindex" : "unknown";
  return { validXml: startsWell && (isUrlset || isIndex), urls, kind };
}
