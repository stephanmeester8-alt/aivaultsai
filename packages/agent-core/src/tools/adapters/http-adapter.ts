import { lookup } from "node:dns/promises";
import net from "node:net";
import type { ExecutionRequest, ExecutionResult } from "../../execution/types.ts";
import { adapterCrashResult, failedResult, succeededResult } from "../../execution/result.ts";

export type HttpAdapterOptions = {
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly maxRedirects?: number;
  /** Injectable fetch (tests); defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Injectable DNS resolver (tests); defaults to node:dns/promises. */
  readonly lookup?: (host: string) => Promise<readonly string[]>;
};

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed → treat as blocked
  }
  const a = parts[0]!;
  const b = parts[1]!;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    if (mapped.includes(".")) return isPrivateIPv4(mapped);
    return true; // non-IPv4-mapped forms are blocked conservatively
  }
  return false;
}

function isBlockedAddress(address: string): boolean {
  const ip = address.split("%")[0]!; // strip zone id
  return net.isIP(ip) === 4 ? isPrivateIPv4(ip) : net.isIP(ip) === 6 ? isPrivateIPv6(ip) : true;
}

/** SSRF guard: DNS-resolve the host and block private/reserved destinations. */
async function assertPublicUrl(
  rawUrl: string,
  lookup: (host: string) => Promise<readonly string[]>,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("only http/https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error("URL credentials are not allowed");
  }
  const hostname = url.hostname;
  if (!hostname || hostname.length === 0) {
    throw new Error("URL host is missing");
  }
  let addresses: readonly string[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new Error("hostname could not be resolved");
  }
  if (addresses.length === 0) {
    throw new Error("hostname resolved to no addresses");
  }
  const blocked = addresses.filter(isBlockedAddress);
  if (blocked.length > 0) {
    throw new Error(`URL resolves to a blocked (private/reserved) address: ${hostname}`);
  }
  return url;
}

/**
 * Read the response body up to `maxBytes` bytes. Oversized responses are
 * accepted partially (transport cap stays hard for memory safety) and marked
 * with `truncated: true` so callers can bound the LLM context instead of
 * failing the whole research.
 */
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
  const merged = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0));
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

const ALLOWED_REQUEST_HEADERS = new Set(["accept", "user-agent"]);

/**
 * Read-only HTTP(S) adapter with SSRF protection. Only GET requests are
 * issued; every hop (including redirects) is re-checked against the SSRF
 * guard. No credentials, cookies or custom Authorization headers are ever
 * forwarded. Response size and time are bounded.
 */
export class HttpAdapter {
  readonly id = "http-adapter";
  readonly toolId = "http" as const;

  readonly #maxBytes: number;
  readonly #timeoutMs: number;
  readonly #maxRedirects: number;
  readonly #fetch: typeof fetch;
  readonly #lookup: (host: string) => Promise<readonly string[]>;

  constructor(options: HttpAdapterOptions = {}) {
    this.#maxBytes = options.maxBytes ?? 256 * 1024;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#maxRedirects = options.maxRedirects ?? 3;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#lookup = options.lookup ?? (async (host) => (await lookup(host, { all: true })).map((record) => record.address));
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    try {
      const capability = String(request.input["capability"] ?? "");
      if (capability !== "API_REQUEST") {
        return failedResult(request, `Unsupported capability: ${capability}`, startedAt);
      }
      const args = (request.input["arguments"] ?? {}) as Record<string, unknown>;
      if (typeof args["url"] !== "string" || args["url"].trim().length === 0) {
        return failedResult(request, "arguments.url is required", startedAt);
      }

      const headers: Record<string, string> = {};
      if (args["headers"] && typeof args["headers"] === "object") {
        for (const [key, value] of Object.entries(args["headers"] as Record<string, unknown>)) {
          const lower = key.toLowerCase();
          if (!ALLOWED_REQUEST_HEADERS.has(lower)) continue; // never forward sensitive headers
          if (typeof value === "string") headers[lower] = value;
        }
      }

      let url = await assertPublicUrl(args["url"], this.#lookup);
      let redirects = 0;
      let response: Response;

      for (;;) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
        try {
          response = await this.#fetch(url.toString(), {
            method: "GET",
            headers: { "user-agent": "aivaultsai-http-adapter/1.0", ...headers },
            redirect: "manual",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location || redirects >= this.#maxRedirects) {
            return failedResult(request, `redirect limit reached (${redirects})`, startedAt);
          }
          redirects += 1;
          url = await assertPublicUrl(new URL(location, url).toString(), this.#lookup);
          continue;
        }
        break;
      }

      const { body, truncated } = await readCappedBody(response, this.#maxBytes);

      return succeededResult(
        request,
        {
          status: response.status,
          ok: response.ok,
          url: response.url,
          body,
          truncated,
        },
        startedAt,
      );
    } catch (error) {
      return adapterCrashResult(request, error, startedAt);
    }
  }
}
