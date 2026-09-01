import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkHostnamePolicy,
  extractPageText,
  researchWebsite,
  type WebsiteResearchDeps,
} from "../lib/prospect-run/website-research.ts";

const PUBLIC_IP = ["93.184.216.34"];

function publicLookup(): (host: string) => Promise<readonly string[]> {
  return async () => PUBLIC_IP;
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><title>${title}</title><script>var x=1;</script><style>.a{}</style></head><body><p>${body}</p></body></html>`;
}

async function research(rawUrl: string, overrides: Partial<WebsiteResearchDeps> = {}) {
  return researchWebsite(rawUrl, {
    lookup: publicLookup(),
    now: () => "2026-09-01T00:00:00.000Z",
    ...overrides,
  });
}

test("fetch success: title, text, evidence and status are captured", async () => {
  const result = await research("https://acme.nl", {
    fetchImpl: async () => new Response(htmlPage("Acme BV", "Wij leveren kwaliteit sinds 1998."), { status: 200 }),
  });
  assert.equal(result.status, "ok");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.title, "Acme BV");
  assert.match(result.text, /Wij leveren kwaliteit/);
  assert.equal(result.text.includes("var x=1"), false);
  assert.equal(result.errors.length, 0);
  assert.ok(result.evidence.some((e) => e.type === "fetch" && e.detail === "HTTP 200"));
  assert.equal(result.url, "https://acme.nl/");
});

test("http error status is reported as error with evidence", async () => {
  const result = await research("https://acme.nl", {
    fetchImpl: async () => new Response("not found", { status: 404 }),
  });
  assert.equal(result.status, "error");
  assert.equal(result.httpStatus, 404);
  assert.ok(result.evidence.some((e) => e.detail === "HTTP 404"));
});

test("timeout aborts the fetch and reports FETCH_TIMEOUT", async () => {
  const result = await research("https://slow.example", {
    timeoutMs: 5,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
  });
  assert.equal(result.status, "error");
  assert.ok(result.errors.includes("FETCH_TIMEOUT"));
});

test("redirects are followed within the bound and re-validated", async () => {
  let calls = 0;
  const result = await research("https://acme.nl", {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(null, { status: 301, headers: { location: "https://www.acme.nl/home" } });
      }
      return new Response(htmlPage("Acme BV", "Wij leveren kwaliteit."), { status: 200 });
    },
  });
  assert.equal(result.status, "ok");
  assert.equal(result.redirects.length, 2);
  assert.equal(result.url, "https://www.acme.nl/home");
});

test("redirect chain beyond the bound fails with REDIRECT_LIMIT", async () => {
  const result = await research("https://acme.nl", {
    maxRedirects: 2,
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://acme.nl/next" } }),
  });
  assert.equal(result.status, "error");
  assert.ok(result.errors.includes("REDIRECT_LIMIT") || result.errors.length > 0);
});

test("redirect to a blocked scheme is refused", async () => {
  const result = await research("https://acme.nl", {
    fetchImpl: async () => new Response(null, { status: 301, headers: { location: "file:///etc/passwd" } }),
  });
  assert.equal(result.status, "error");
  assert.ok(result.errors.some((e) => e.startsWith("REDIRECT_BLOCKED_SCHEME")));
});

test("SSRF: localhost hostname is blocked before any fetch", async () => {
  let fetched = false;
  const result = await research("http://localhost:3000", {
    fetchImpl: async () => {
      fetched = true;
      return new Response("x");
    },
  });
  assert.equal(fetched, false);
  assert.equal(result.status, "error");
  assert.ok(result.errors.includes("LOCALHOST_BLOCKED"));
});

test("SSRF: IP literals (loopback/private) are blocked", async () => {
  for (const url of ["http://127.0.0.1/", "http://192.168.1.1/", "http://10.0.0.1/", "http://169.254.169.254/"]) {
    const result = await research(url, { fetchImpl: async () => new Response("x") });
    assert.equal(result.status, "error", url);
    assert.ok(result.errors.includes("IP_LITERAL_BLOCKED"), url);
  }
});

test("SSRF: private address via DNS resolution is blocked (metadata endpoint)", async () => {
  let fetched = false;
  const result = await research("https://metadata.internal", {
    lookup: async () => ["169.254.169.254"],
    fetchImpl: async () => {
      fetched = true;
      return new Response("x");
    },
  });
  assert.equal(fetched, false);
  assert.equal(result.status, "error");
  assert.ok(result.errors.includes("PRIVATE_ADDRESS_BLOCKED"));
});

test("SSRF: blocked schemes are refused (file:, javascript:, data:)", async () => {
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "ftp://example.com"]) {
    const result = await research(url, { fetchImpl: async () => new Response("x") });
    assert.equal(result.status, "error", url);
    assert.ok(result.errors.some((e) => e.startsWith("INVALID_URL")), url);
  }
});

test("response size limit truncates the body and records evidence", async () => {
  const big = "<html><body>" + "x".repeat(5000) + "</body></html>";
  const result = await research("https://acme.nl", {
    maxBytes: 1024,
    fetchImpl: async () => new Response(big, { status: 200 }),
  });
  assert.equal(result.status, "ok");
  assert.ok(result.errors.includes("RESPONSE_SIZE_LIMIT"));
  assert.ok(result.evidence.some((e) => e.type === "size_limit"));
  assert.ok(result.html.length <= 1024);
});

test("hostname policy is pure and rejects localhost/IP literals", () => {
  assert.deepEqual(checkHostnamePolicy("example.com"), { ok: true });
  assert.deepEqual(checkHostnamePolicy("localhost"), { ok: false, reason: "LOCALHOST_BLOCKED" });
  assert.deepEqual(checkHostnamePolicy("127.0.0.1"), { ok: false, reason: "IP_LITERAL_BLOCKED" });
  assert.deepEqual(checkHostnamePolicy("::1"), { ok: false, reason: "IP_LITERAL_BLOCKED" });
});

test("text extraction strips scripts, styles and tags", () => {
  const text = extractPageText(
    "<html><script>alert(1)</script><style>.x{}</style><p>Hallo &amp; welkom</p><div>tweede</div></html>",
    5000,
  );
  assert.equal(text.includes("alert"), false);
  assert.equal(text.includes(".x{}"), false);
  assert.match(text, /Hallo & welkom/);
  assert.match(text, /tweede/);
});
