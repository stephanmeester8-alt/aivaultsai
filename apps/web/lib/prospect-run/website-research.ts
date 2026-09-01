/**
 * Controlled website research service (TASK: Prospect Discovery + AI Detection).
 *
 * Fetches a public company website under strict guards:
 * - http/https only; file:, ftp:, javascript:, data:, chrome:, about:, ws:, wss: blocked
 * - localhost, IP-literal hosts, private/link-local/loopback/metadata addresses blocked
 *   (hostname check + DNS resolution check via the shared seo/url-policy guards)
 * - bounded redirects, every hop re-validated
 * - timeout and response-size limits
 *
 * The raw HTML is returned for the deterministic AI-detection stage only; the
 * extracted text is the sanitized input for any later LLM analysis. Evidence is
 * always attached so downstream stages never claim unverified facts.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import {
  bareHostname,
  isHostBlocked,
  isLocalhostName,
  validateUrl,
} from "../seo/url-policy.ts";

export type CrawlStatus = "ok" | "error";

export interface ResearchEvidenceItem {
  type: string;
  source: string;
  detail: string;
}

export interface WebsiteResearchResult {
  url: string;
  httpStatus: number | null;
  title: string | null;
  /** Raw HTML for the deterministic detection stage. Never sent to an LLM. */
  html: string;
  /** Whitespace-collapsed, tag-stripped text (sanitized, length-capped). */
  text: string;
  fetchedAt: string;
  durationMs: number;
  redirects: string[];
  errors: string[];
  evidence: ResearchEvidenceItem[];
  status: CrawlStatus;
}

export interface WebsiteResearchDeps {
  fetchImpl?: typeof fetch;
  /** DNS resolver: (host) => addresses. Defaults to node:dns/promises lookup. */
  lookup?: (host: string) => Promise<readonly string[]>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  maxTextChars?: number;
  now?: () => string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_TEXT_CHARS = 20_000;

export function isPlainHostname(host: string): boolean {
  return !isLocalhostName(host) && !host.includes(":") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** Hostname policy before any network I/O: literal IPs and localhost are refused. */
export function checkHostnamePolicy(host: string): { ok: true } | { ok: false; reason: string } {
  if (isLocalhostName(host)) return { ok: false, reason: "LOCALHOST_BLOCKED" };
  if (host.includes(":")) return { ok: false, reason: "IP_LITERAL_BLOCKED" };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { ok: false, reason: "IP_LITERAL_BLOCKED" };
  return { ok: true };
}

/** DNS-level guard: resolves the host and blocks any private address. */
export async function checkDnsPolicy(
  host: string,
  lookup: (host: string) => Promise<readonly string[]>,
): Promise<{ ok: true } | { ok: false; reason: string; addresses?: string[] }> {
  let addresses: readonly string[];
  try {
    addresses = await lookup(host);
  } catch {
    return { ok: false, reason: "DNS_RESOLUTION_FAILED" };
  }
  if (isHostBlocked(host, addresses)) {
    return { ok: false, reason: "PRIVATE_ADDRESS_BLOCKED", addresses: [...addresses] };
  }
  return { ok: true };
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const title = match[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return title.length > 0 ? title.slice(0, 300) : null;
}

/** Strip scripts/styles/tags and collapse whitespace; length-capped. */
export function extractPageText(html: string, maxChars: number): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = withoutScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, maxChars);
}

async function readCappedBody(
  response: Response,
  maxBytes: number,
): Promise<{ body: string; truncated: boolean }> {
  if (!response.body) {
    return { body: "", truncated: false };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        truncated = true;
        const remaining = maxBytes - (total - value.byteLength);
        if (remaining > 0) chunks.push(value.subarray(0, remaining));
        break;
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(chunks.reduce((acc, c) => acc + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    body: new TextDecoder("utf-8", { fatal: false }).decode(merged).replace(/\0/g, ""),
    truncated,
  };
}

function fail(url: string, errors: string[], evidence: ResearchEvidenceItem[], now: string): WebsiteResearchResult {
  return {
    url,
    httpStatus: null,
    title: null,
    html: "",
    text: "",
    fetchedAt: now,
    durationMs: 0,
    redirects: [],
    errors,
    evidence,
    status: "error",
  };
}

/**
 * Fetch one page with guards. `baseUrl` is the original request URL (used for
 * evidence); `targetUrl` is the current hop. Redirects are followed manually so
 * every hop passes the same scheme/hostname/DNS policy.
 */
export async function researchWebsite(
  rawUrl: string,
  deps: WebsiteResearchDeps = {},
): Promise<WebsiteResearchResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookup = deps.lookup ?? (async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address));
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = deps.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxTextChars = deps.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS;
  const now = deps.now ?? (() => new Date().toISOString());
  const startedAt = Date.now();

  const initial = validateUrl(rawUrl);
  if (!initial.ok) {
    return fail(rawUrl, [`INVALID_URL: ${initial.reason}`], [], now());
  }
  const hostPolicy = checkHostnamePolicy(initial.url.hostname);
  if (!hostPolicy.ok) {
    return fail(rawUrl, [hostPolicy.reason], [{ type: "policy", source: rawUrl, detail: hostPolicy.reason }], now());
  }
  const dnsPolicy = await checkDnsPolicy(bareHostname(initial.url), lookup);
  if (!dnsPolicy.ok) {
    return fail(rawUrl, [dnsPolicy.reason], [{ type: "policy", source: rawUrl, detail: dnsPolicy.reason }], now());
  }

  const redirects: string[] = [];
  const errors: string[] = [];
  const evidence: ResearchEvidenceItem[] = [];
  let currentUrl = initial.url;
  let final: WebsiteResearchResult | null = null;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "AIVaultsAI-ProspectResearch/0.1 (admin-triggered; respectful crawler)",
          accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "unknown";
      errors.push(name === "AbortError" ? "FETCH_TIMEOUT" : `FETCH_FAILED:${name}`);
      break;
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        errors.push("REDIRECT_WITHOUT_LOCATION");
        break;
      }
      const next = new URL(location, currentUrl);
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        errors.push(`REDIRECT_BLOCKED_SCHEME:${next.protocol}`);
        evidence.push({ type: "redirect", source: currentUrl.href, detail: `blocked scheme ${next.protocol}` });
        break;
      }
      const nextHostPolicy = checkHostnamePolicy(next.hostname);
      if (!nextHostPolicy.ok) {
        errors.push(`REDIRECT_${nextHostPolicy.reason}`);
        break;
      }
      const nextDns = await checkDnsPolicy(bareHostname(next), lookup);
      if (!nextDns.ok) {
        errors.push(`REDIRECT_${nextDns.reason}`);
        break;
      }
      redirects.push(currentUrl.href);
      evidence.push({ type: "redirect", source: currentUrl.href, detail: `HTTP ${status} -> ${next.href}` });
      currentUrl = next;
      continue;
    }

    const { body, truncated } = await readCappedBody(response, maxBytes);
    if (truncated) {
      errors.push("RESPONSE_SIZE_LIMIT");
      evidence.push({
        type: "size_limit",
        source: currentUrl.href,
        detail: `body capped at ${maxBytes} bytes`,
      });
    }
    const html = body;
    final = {
      url: currentUrl.href,
      httpStatus: status,
      title: extractTitle(html),
      html,
      text: extractPageText(html, maxTextChars),
      fetchedAt: now(),
      durationMs: Date.now() - startedAt,
      redirects: [...redirects, currentUrl.href],
      errors,
      evidence: [
        ...evidence,
        { type: "fetch", source: currentUrl.href, detail: `HTTP ${status}` },
      ],
      status: status >= 200 && status < 300 ? "ok" : "error",
    };
    break;
  }

  if (!final) {
    return fail(
      rawUrl,
      errors.length > 0 ? errors : ["REDIRECT_LIMIT"],
      evidence,
      now(),
    );
  }
  return final;
}
