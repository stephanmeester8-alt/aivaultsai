/**
 * Compact, normalized website research representation (TASK: fix website
 * research). The LLM NEVER receives raw HTML: this module extracts the
 * research signals deterministically (no LLM, no cost) and bounds every
 * field so the assistant context stays small and predictable.
 *
 * Reuses the existing deterministic AI/chatbot detection and the existing
 * page-text extraction — no second detector, no second parser architecture.
 */

import { detectAiAssistant, type AiDetectionResult } from "../prospect-run/ai-detection.ts";
import { extractPageText } from "../prospect-run/website-research.ts";

export interface ResearchSummaryLimits {
  maxVisibleTextChars?: number;
  maxHeadings?: number;
  maxLinks?: number;
  maxContactSignals?: number;
  maxScriptSrcs?: number;
  maxIframeSrcs?: number;
  maxTitleChars?: number;
  maxDescriptionChars?: number;
}

export interface ContactSignals {
  mailto: string[];
  tel: string[];
}

export interface ResearchSummary {
  url: string;
  pagesChecked: string[];
  title: string | null;
  description: string | null;
  headings: string[];
  /** Bounded, script/style-free visible text (the only text the LLM sees). */
  visibleText: string;
  /** Bounded external links (http/https). */
  links: string[];
  contactSignals: ContactSignals;
  hasForm: boolean;
  iframeSrcs: string[];
  scriptSrcs: string[];
  /** Deterministic AI/chatbot detection over ALL checked pages. */
  chatbotDetection: AiDetectionResult | null;
  technologies: string[];
  truncated: boolean;
  limitations: string[];
}

const DEFAULT_LIMITS: Required<ResearchSummaryLimits> = {
  maxVisibleTextChars: 4000,
  maxHeadings: 20,
  maxLinks: 40,
  maxContactSignals: 10,
  maxScriptSrcs: 20,
  maxIframeSrcs: 10,
  maxTitleChars: 200,
  maxDescriptionChars: 300,
};

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueBounded(values: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function extractMetaDescription(html: string): string | null {
  const match = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)
    ?? /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html);
  if (!match) return null;
  const description = stripTags(match[1]!).slice(0, DEFAULT_LIMITS.maxDescriptionChars);
  return description.length > 0 ? description : null;
}

function extractHeadings(html: string, max: number): string[] {
  const headings: string[] = [];
  const regex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null && headings.length < max) {
    const text = stripTags(match[2]!).slice(0, 160);
    if (text.length > 0) headings.push(text);
  }
  return headings;
}

function extractAttributeValues(
  html: string,
  tag: string,
  attribute: string,
  max: number,
): string[] {
  const values: string[] = [];
  const regex = new RegExp(`<${tag}[^>]*\\b${attribute}=["']([^"']+)["']`, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null && values.length < max) {
    values.push(match[1]!);
  }
  return values;
}

/** Build the compact research representation for one fetched page. */
export function buildResearchSummary(
  html: string,
  url: string,
  limits: ResearchSummaryLimits = {},
): ResearchSummary {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  const limitations: string[] = [];

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? stripTags(titleMatch[1]!).slice(0, lim.maxTitleChars) : null;

  const description = extractMetaDescription(html);
  const headings = extractHeadings(html, lim.maxHeadings);
  const visibleText = extractPageText(html, lim.maxVisibleTextChars);
  if (visibleText.length === 0) limitations.push("no_visible_text");

  // Links: only explicit public http(s) hrefs (bounded).
  const links: string[] = [];
  const hrefRe = /<a[^>]*\bhref=["']([^"']+)["']/gi;
  let hrefMatch: RegExpExecArray | null;
  while ((hrefMatch = hrefRe.exec(html)) !== null) {
    const href = hrefMatch[1]!;
    if (/^https?:\/\//i.test(href)) links.push(href.slice(0, 250));
    if (links.length >= lim.maxLinks * 2) break;
  }

  // Contact signals: explicit mailto:/tel: links only (public, no harvesting).
  const mailto: string[] = [];
  const tel: string[] = [];
  const contactRe = /<a[^>]*\bhref=["'](mailto:|tel:)([^"']+)["']/gi;
  let contactMatch: RegExpExecArray | null;
  while ((contactMatch = contactRe.exec(html)) !== null) {
    const kind = contactMatch[1]!.toLowerCase();
    const value = contactMatch[2]!.slice(0, 200);
    if (kind === "mailto:") mailto.push(value);
    else tel.push(value);
    if (mailto.length + tel.length >= lim.maxContactSignals) break;
  }

  const iframeSrcs = extractAttributeValues(html, "iframe", "src", lim.maxIframeSrcs);
  const scriptSrcs = extractAttributeValues(html, "script", "src", lim.maxScriptSrcs);
  const hasForm = /<form[\s>]/i.test(html) || /<input[^>]+type=["'](?:text|email|tel|search)["']/i.test(html);

  // Deterministic AI/chatbot detection (reuses the existing detector).
  const chatbotDetection = detectAiAssistant(html, url);

  return {
    url,
    pagesChecked: [url],
    title: title && title.length > 0 ? title : null,
    description,
    headings,
    visibleText,
    links: uniqueBounded(links, lim.maxLinks),
    contactSignals: {
      mailto: uniqueBounded(mailto, lim.maxContactSignals),
      tel: uniqueBounded(tel, lim.maxContactSignals),
    },
    hasForm,
    iframeSrcs: uniqueBounded(iframeSrcs, lim.maxIframeSrcs),
    scriptSrcs: uniqueBounded(scriptSrcs, lim.maxScriptSrcs),
    chatbotDetection,
    technologies: [...chatbotDetection.detectedTechnologies],
    truncated: false,
    limitations,
  };
}

/**
 * Merge a subpage research result into the primary summary (bounded):
 * detection evidence from every actually checked page is preserved.
 */
export function mergeResearchSummary(
  primary: ResearchSummary,
  additional: ResearchSummary,
): ResearchSummary {
  const pages = uniqueBounded([...primary.pagesChecked, ...additional.pagesChecked], 10);
  const evidence = [...(primary.chatbotDetection?.evidence ?? [])];
  const technologies = new Set(primary.technologies);

  if (additional.chatbotDetection) {
    for (const item of additional.chatbotDetection.evidence) {
      if (!evidence.some((existing) => existing.type === item.type && existing.detail === item.detail)) {
        evidence.push(item);
      }
    }
    for (const tech of additional.chatbotDetection.detectedTechnologies) {
      technologies.add(tech);
    }
  }

  const status = (() => {
    if (primary.chatbotDetection?.status === "yes" || additional.chatbotDetection?.status === "yes") return "yes";
    if (primary.chatbotDetection?.status === "unknown" || additional.chatbotDetection?.status === "unknown") return "unknown";
    return "no";
  })();
  const confidence = Math.max(
    primary.chatbotDetection?.confidence ?? 0,
    additional.chatbotDetection?.confidence ?? 0,
  );

  return {
    ...primary,
    pagesChecked: pages,
    visibleText:
      primary.visibleText.length < 2000 && additional.visibleText
        ? `${primary.visibleText}\n\n${additional.visibleText}`.slice(0, 5000)
        : primary.visibleText,
    contactSignals: {
      mailto: uniqueBounded(
        [...primary.contactSignals.mailto, ...additional.contactSignals.mailto],
        DEFAULT_LIMITS.maxContactSignals,
      ),
      tel: uniqueBounded(
        [...primary.contactSignals.tel, ...additional.contactSignals.tel],
        DEFAULT_LIMITS.maxContactSignals,
      ),
    },
    links: uniqueBounded([...primary.links, ...additional.links], DEFAULT_LIMITS.maxLinks),
    chatbotDetection: {
      status,
      confidence: Number(confidence.toFixed(2)),
      evidence,
      detectedTechnologies: [...technologies],
      checkedPages: pages,
    },
    technologies: [...technologies],
    truncated: primary.truncated || additional.truncated,
    limitations: uniqueBounded(
      [...primary.limitations, ...additional.limitations],
      10,
    ),
  };
}
