/**
 * Bounded, policy-enforced HTTP fetch for the read-only SEO scanner.
 *
 * - timeout, response-size cap, max redirects (default 3)
 * - every hop re-validated: scheme, private IP, same-origin
 * - injectable fetch + DNS resolver for unit tests (no network in tests)
 */

import { lookup } from "node:dns/promises";

import {
  bareHostname,
  isHostBlocked,
  sameOrigin,
  validateUrl,
} from "./url-policy.ts";

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
export const DEFAULT_MAX_REDIRECTS = 3;
export const SCANNER_USER_AGENT =
  "AIVaultsAI-SEO-Scanner/0.1 (+https://www.aivaultsai.one)";

export interface FetchPolicy {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
}

export interface FetchDeps {
  fetchFn?: typeof fetch;
  /** Resolve a hostname to IP addresses. Tests inject a fake resolver. */
  lookupFn?: (hostname: string) => Promise<string[]>;
}

export interface HttpResult {
  ok: boolean;
  statusCode: number | null;
  contentType: string | null;
  responseTimeMs: number;
  redirects: string[];
  body: string;
  finalUrl: string;
  error: string | null;
  /** Present when the request was blocked by the policy (SSRF guard). */
  blocked: string | null;
}

const REDIRECT = new Set(["301", "302", "303", "307", "308"]);

async function resolveAddresses(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true });
  return records.map((record) => record.address);
}

function blockedResult(
  url: string,
  reason: string,
  redirects: string[],
  responseTimeMs: number,
): HttpResult {
  return {
    ok: false,
    statusCode: null,
    contentType: null,
    responseTimeMs,
    redirects,
    body: "",
    finalUrl: url,
    error: reason,
    blocked: reason,
  };
}

/**
 * Fetch a URL following the read-only scanner policy.
 * Never follows redirects to a different origin and never touches
 * private addresses.
 */
export async function fetchWithPolicy(
  targetUrl: string,
  policy: FetchPolicy = {},
  deps: FetchDeps = {},
): Promise<HttpResult> {
  const startedAt = Date.now();
  const redirects: string[] = [];
  const timeoutMs = policy.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = policy.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const maxRedirects = policy.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const userAgent = policy.userAgent ?? SCANNER_USER_AGENT;
  const fetchFn = deps.fetchFn ?? fetch;
  const lookupFn = deps.lookupFn ?? resolveAddresses;

  const originalValidation = validateUrl(targetUrl);
  if (!originalValidation.ok) {
    return blockedResult(targetUrl, originalValidation.reason, redirects, Date.now() - startedAt);
  }
  const original = originalValidation.url;

  let current: URL = original;
  let hops = 0;

  while (true) {
    // Policy per hop.
    const validation = validateUrl(current.toString());
    if (!validation.ok) {
      return blockedResult(current.toString(), validation.reason, redirects, Date.now() - startedAt);
    }
    const url = validation.url;
    const host = bareHostname(url);
    let addresses: string[];
    try {
      addresses = await lookupFn(host);
    } catch {
      return blockedResult(current.toString(), "DNS resolution failed", redirects, Date.now() - startedAt);
    }
    if (isHostBlocked(host, addresses)) {
      return blockedResult(current.toString(), "Private or reserved address blocked", redirects, Date.now() - startedAt);
    }
    if (!sameOrigin(original, url)) {
      return blockedResult(current.toString(), "Off-origin redirect blocked", redirects, Date.now() - startedAt);
    }

    let response: Response;
    try {
      response = await fetchFn(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml,application/xml,text/plain,*/*" },
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "unknown";
      return blockedResult(
        current.toString(),
        name === "TimeoutError" ? "Request timed out" : "Request failed",
        redirects,
        Date.now() - startedAt,
      );
    }

    if (REDIRECT.has(String(response.status))) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          ok: false,
          statusCode: response.status,
          contentType: response.headers.get("content-type"),
          responseTimeMs: Date.now() - startedAt,
          redirects,
          body: "",
          finalUrl: current.toString(),
          error: "Redirect without Location header",
          blocked: null,
        };
      }
      hops += 1;
      if (hops > maxRedirects) {
        return {
          ok: false,
          statusCode: response.status,
          contentType: response.headers.get("content-type"),
          responseTimeMs: Date.now() - startedAt,
          redirects,
          body: "",
          finalUrl: current.toString(),
          error: `Too many redirects (>${maxRedirects})`,
          blocked: null,
        };
      }
      redirects.push(location);
      const nextValidation = validateUrl(new URL(location, current).toString());
      if (!nextValidation.ok) {
        return blockedResult(location, nextValidation.reason, redirects, Date.now() - startedAt);
      }
      current = nextValidation.url;
      continue;
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
      return {
        ok: false,
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        responseTimeMs: Date.now() - startedAt,
        redirects,
        body: "",
        finalUrl: current.toString(),
        error: "Response exceeds size cap",
        blocked: null,
      };
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      return {
        ok: false,
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        responseTimeMs: Date.now() - startedAt,
        redirects,
        body: "",
        finalUrl: current.toString(),
        error: "Failed to read response body",
        blocked: null,
      };
    }

    if (body.length > maxResponseBytes) {
      return {
        ok: false,
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        responseTimeMs: Date.now() - startedAt,
        redirects,
        body: "",
        finalUrl: current.toString(),
        error: "Response exceeds size cap",
        blocked: null,
      };
    }

    return {
      ok: response.ok,
      statusCode: response.status,
      contentType: response.headers.get("content-type"),
      responseTimeMs: Date.now() - startedAt,
      redirects,
      body,
      finalUrl: current.toString(),
      error: response.ok ? null : `HTTP ${response.status}`,
      blocked: null,
    };
  }
}
