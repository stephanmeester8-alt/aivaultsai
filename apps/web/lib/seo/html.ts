/**
 * Regex-based HTML extraction for the read-only SEO scanner (MVP).
 *
 * Documented limitation: attribute values containing '>' or '<' inside
 * quotes can break the tag-splitting heuristics. A real HTML parser is
 * out of scope for the MVP.
 */

import type { ImageInfo, JsonLdBlock, LinkInfo } from "./types.ts";

const ATTR_RE =
  /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

export function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(ATTR_RE)) {
    const key = match[1]!.toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = value;
  }
  return attrs;
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? stripTags(match[1]!) : null;
}

/** Meta by name or property, e.g. extractMeta(html, "description"). */
export function extractMeta(html: string, wanted: string): string | null {
  const target = wanted.toLowerCase();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttrs(match[0]);
    const name = (attrs["name"] ?? attrs["property"] ?? "").toLowerCase();
    if (name === target) {
      const content = attrs["content"];
      if (content === undefined) return null;
      const trimmed = content.trim();
      return trimmed === "" ? null : trimmed;
    }
  }
  return null;
}

export function extractCanonical(html: string): string | null {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttrs(match[0]);
    const rel = (attrs["rel"] ?? "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical")) {
      const href = attrs["href"]?.trim();
      return href === undefined || href === "" ? null : href;
    }
  }
  return null;
}

export interface ExtractedHeadings {
  h1: string[];
  h2: string[];
  h3: string[];
}

export function extractHeadings(html: string): ExtractedHeadings {
  const h1: string[] = [];
  const h2: string[] = [];
  const h3: string[] = [];
  for (const match of html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = stripTags(match[2]!);
    if (text === "") continue;
    const level = Number(match[1]);
    if (level === 1) h1.push(text);
    else if (level === 2) h2.push(text);
    else h3.push(text);
  }
  return { h1, h2, h3 };
}

export function extractLinks(html: string): LinkInfo[] {
  const links: LinkInfo[] = [];
  for (const match of html.matchAll(/<a\b[\s\S]*?<\/a>/gi)) {
    const tagEnd = match[0].indexOf(">");
    if (tagEnd === -1) continue;
    const openTag = match[0].slice(0, tagEnd + 1);
    const inner = match[0].slice(tagEnd + 1);
    const attrs = parseAttrs(openTag);
    const href = attrs["href"]?.trim();
    if (href === undefined || href === "") continue;
    if (href.startsWith("#")) continue;
    if (/^(javascript|mailto|tel|data):/i.test(href)) continue;
    links.push({ href, text: stripTags(inner).slice(0, 200) });
  }
  return links;
}

/**
 * Extract in-page fragment links (href starting with "#").
 * These are navigation signals, NOT crawl targets: they are kept out of
 * extractLinks() so the crawler never treats them as pages to fetch.
 */
export function extractAnchors(html: string): LinkInfo[] {
  const anchors: LinkInfo[] = [];
  for (const match of html.matchAll(/<a\b[\s\S]*?<\/a>/gi)) {
    const tagEnd = match[0].indexOf(">");
    if (tagEnd === -1) continue;
    const openTag = match[0].slice(0, tagEnd + 1);
    const inner = match[0].slice(tagEnd + 1);
    const attrs = parseAttrs(openTag);
    const href = attrs["href"]?.trim();
    if (href === undefined || href === "") continue;
    if (!href.startsWith("#")) continue;
    anchors.push({ href, text: stripTags(inner).slice(0, 200) });
  }
  return anchors;
}

export function extractImages(html: string): ImageInfo[] {
  const images: ImageInfo[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = parseAttrs(match[0]);
    const src = attrs["src"]?.trim();
    if (src === undefined || src === "") continue;
    const alt = attrs["alt"]?.trim() ?? null;
    images.push({ src, alt: alt === "" ? null : alt });
  }
  return images;
}

export function extractJsonLd(html: string): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const raw = match[2]!.trim();
    if (raw === "") continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const node = (Array.isArray(parsed) ? parsed[0] : parsed) as
        | Record<string, unknown>
        | undefined;
      const context = typeof node?.["@context"] === "string" ? (node["@context"] as string) : null;
      const typeValue = node?.["@type"];
      const types = Array.isArray(typeValue)
        ? typeValue.map((t) => String(t))
        : typeof typeValue === "string"
          ? [typeValue]
          : [];
      blocks.push({ valid: true, context, types, error: null });
    } catch (error) {
      blocks.push({
        valid: false,
        context: null,
        types: [],
        error: error instanceof Error ? error.message.slice(0, 120) : "parse error",
      });
    }
  }
  return blocks;
}

export function extractHtmlLang(html: string): string | null {
  const match = /<html\b[^>]*lang=(["'])([^"']*)\1/i.exec(html);
  return match ? match[2] : null;
}

export function detectFaqSignals(html: string): { detailsCount: number; hasFaqId: boolean } {
  const detailsCount = (html.match(/<details\b/gi) ?? []).length;
  const hasFaqId = /id=["']faq["']/i.test(html);
  return { detailsCount, hasFaqId };
}

/**
 * Heading structure anomalies (MVP):
 * - no h1 at all
 * - more than one h1
 * - first heading is not h1
 * - an h3 appears before any h2 (level skip)
 */
export function analyzeHeadings(
  h1: string[],
  h2: string[],
  h3: string[],
): { anomalies: string[] } {
  const anomalies: string[] = [];
  if (h1.length === 0) anomalies.push("missing-h1");
  if (h1.length > 1) anomalies.push("multiple-h1");
  if (h1.length === 0 && (h2.length > 0 || h3.length > 0)) {
    anomalies.push("first-heading-not-h1");
  }
  if (h1.length > 0 && h2.length === 0 && h3.length > 0) {
    anomalies.push("heading-level-skip");
  }
  return { anomalies };
}
