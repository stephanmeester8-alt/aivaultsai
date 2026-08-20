/**
 * Pure URL normalization for SEO comparison (FIX-001).
 *
 * IMPORTANT: this is NOT a security policy. SSRF/validation rules live in
 * url-policy.ts and are untouched. Normalization only produces a canonical
 * string form so that equivalent URLs compare equal:
 *
 *   https://example.com        ==  https://example.com/
 *   https://EXAMPLE.COM        ==  https://example.com
 *   https://example.com:443    ==  https://example.com
 *   http://example.com:80      ==  http://example.com
 *   https://example.com/about/ ==  https://example.com/about
 *   https://example.com/page#x ==  https://example.com/page
 *
 * Query strings are PRESERVED (a=1 is not the same as no query). Fragments
 * are dropped (not a server resource). Credentials are stripped so they can
 * never surface in SEO output.
 */

export function normalizeUrl(input: string | URL): string {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : new URL(input.toString());
  } catch {
    // Unparseable input stays as-is so distinct inputs stay distinct.
    return typeof input === "string" ? input : input.toString();
  }

  const scheme = url.protocol.toLowerCase();
  const host = url.hostname.toLowerCase();

  let port = url.port;
  if ((scheme === "https:" && port === "443") || (scheme === "http:" && port === "80")) {
    port = "";
  }

  let path = url.pathname;
  if (path === "/") {
    path = "";
  } else if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  // Query preserved verbatim; fragment dropped; credentials omitted.
  const hostPart = port === "" ? host : `${host}:${port}`;
  return `${scheme}//${hostPart}${path}${url.search}`;
}

/** Resolve a possibly-relative URL against a base; null when unparseable. */
export function resolveUrl(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}
