import assert from "node:assert/strict";
import { test } from "node:test";

import { crawlSite } from "../lib/seo/crawler.ts";
import { fetchWithPolicy, type FetchDeps } from "../lib/seo/http.ts";

const PUBLIC_IP = "93.184.216.34";
const lookupFn: FetchDeps["lookupFn"] = async () => [PUBLIC_IP];

type Route = { status: number; body: string; headers?: Record<string, string> };

function mockFetch(routes: Record<string, Route>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const route = routes[url];
    if (!route) {
      return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    }
    return new Response(route.body, {
      status: route.status,
      headers: { "content-type": "text/html", ...route.headers },
    });
  }) as typeof fetch;
}

function baseRoutes(extra: Record<string, Route> = {}): Record<string, Route> {
  return {
    "https://www.example.com/robots.txt": {
      status: 200,
      body: "User-agent: *\nAllow: /\nSitemap: https://www.example.com/sitemap.xml\n",
    },
    "https://www.example.com/sitemap.xml": {
      status: 200,
      body: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.example.com/</loc></url></urlset>',
    },
    ...extra,
  };
}

test("crawler discovers same-origin pages up to depth 1", async () => {
  const routes = baseRoutes({
    "https://www.example.com/": {
      status: 200,
      body: '<html><head><title>T</title></head><body><h1>Home</h1><a href="/over">Over</a><a href="https://extern.nl/x">Extern</a></body></html>',
    },
    "https://www.example.com/over": {
      status: 200,
      body: "<html><head><title>Over</title></head><body><h1>Over</h1></body></html>",
    },
  });

  const result = await crawlSite("https://www.example.com/", {
    deps: { fetchFn: mockFetch(routes), lookupFn },
    maxUrls: 50,
    maxDepth: 1,
    log: () => undefined,
  });

  assert.equal(result.pages.length, 2);
  assert.ok(result.pages.some((p) => p.url === "https://www.example.com/"));
  assert.ok(result.pages.some((p) => p.url === "https://www.example.com/over"));
  assert.equal(result.robots?.exists, true);
  assert.equal(result.sitemap?.exists, true);
});

test("crawler respects maxUrls", async () => {
  const routes = baseRoutes({
    "https://www.example.com/": {
      status: 200,
      body: '<a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>',
    },
    "https://www.example.com/a": { status: 200, body: "<h1>A</h1>" },
    "https://www.example.com/b": { status: 200, body: "<h1>B</h1>" },
    "https://www.example.com/c": { status: 200, body: "<h1>C</h1>" },
  });

  const result = await crawlSite("https://www.example.com/", {
    deps: { fetchFn: mockFetch(routes), lookupFn },
    maxUrls: 2,
    maxDepth: 1,
    log: () => undefined,
  });

  assert.equal(result.pages.length, 2);
});

test("crawler isolates per-URL failures (PARTIAL, not failed)", async () => {
  const routes = baseRoutes({
    "https://www.example.com/": {
      status: 200,
      body: '<a href="/kapot">Kapot</a><a href="/ok">Ok</a>',
    },
    "https://www.example.com/kapot": { status: 500, body: "" },
    "https://www.example.com/ok": { status: 200, body: "<h1>Ok</h1>" },
  });

  const result = await crawlSite("https://www.example.com/", {
    deps: { fetchFn: mockFetch(routes), lookupFn },
    maxUrls: 50,
    maxDepth: 1,
    log: () => undefined,
  });

  assert.equal(result.failedUrls.length, 1);
  assert.ok(result.failedUrls.includes("https://www.example.com/kapot"));
  assert.ok(result.pages.some((p) => p.url === "https://www.example.com/ok"));
});

test("fetchWithPolicy blocks private IP addresses", async () => {
  const deps: FetchDeps = {
    fetchFn: mockFetch({}),
    lookupFn: async () => ["127.0.0.1"],
  };
  const result = await fetchWithPolicy("http://127.0.0.1/", {}, deps);
  assert.equal(result.ok, false);
  assert.match(result.blocked ?? "", /private|reserved/i);
});

test("fetchWithPolicy blocks the cloud metadata endpoint", async () => {
  const deps: FetchDeps = {
    fetchFn: mockFetch({}),
    lookupFn: async () => ["169.254.169.254"],
  };
  const result = await fetchWithPolicy("http://169.254.169.254/latest/meta-data/", {}, deps);
  assert.equal(result.ok, false);
});

test("fetchWithPolicy does not follow off-origin redirects", async () => {
  const deps: FetchDeps = {
    lookupFn,
    fetchFn: (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://www.example.com/") {
        return new Response(null, { status: 301, headers: { location: "https://evil.example.net/" } });
      }
      return new Response("x", { status: 200 });
    }) as typeof fetch,
  };
  const result = await fetchWithPolicy("https://www.example.com/", {}, deps);
  assert.equal(result.ok, false);
  assert.equal(result.blocked, "Off-origin redirect blocked");
});

test("fetchWithPolicy enforces the redirect cap", async () => {
  const deps: FetchDeps = {
    lookupFn,
    fetchFn: (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://www.example.com/a") {
        return new Response(null, { status: 301, headers: { location: "/b" } });
      }
      if (url === "https://www.example.com/b") {
        return new Response(null, { status: 301, headers: { location: "/a" } });
      }
      return new Response("x", { status: 200 });
    }) as typeof fetch,
  };
  const result = await fetchWithPolicy("https://www.example.com/a", { maxRedirects: 3 }, deps);
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Too many redirects/);
});

test("fetchWithPolicy enforces the response size cap", async () => {
  const deps: FetchDeps = {
    lookupFn,
    fetchFn: mockFetch({
      "https://www.example.com/": { status: 200, body: "x".repeat(200) },
    }),
  };
  const result = await fetchWithPolicy(
    "https://www.example.com/",
    { maxResponseBytes: 100 },
    deps,
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /size cap/i);
});

test("crawler records anchor links but never crawls them (FIX-002)", async () => {
  const routes = baseRoutes({
    "https://www.example.com/": {
      status: 200,
      body: '<a href="#sectie">Sectie</a><a href="#contact">Contact</a><a href="/echt">Echt</a>',
    },
    "https://www.example.com/echt": { status: 200, body: "<h1>Echt</h1>" },
  });

  const result = await crawlSite("https://www.example.com/", {
    deps: { fetchFn: mockFetch(routes), lookupFn },
    maxUrls: 50,
    maxDepth: 1,
    log: () => undefined,
  });

  // Only "/" and "/echt" were fetched; "#sectie" and "#contact" were NOT.
  assert.equal(result.pages.length, 2);
  const home = result.pages.find((p) => p.url === "https://www.example.com/")!;
  assert.equal(home.anchorLinks.length, 2);
  assert.equal(home.internalLinks.length, 1);
});

test("crawler strips fragments from page links before enqueueing (TASK 18)", async () => {
  const routes = baseRoutes({
    "https://www.example.com/": {
      status: 200,
      body: '<a href="/#pricing">Prijzen</a><a href="/#live-ai">Demo</a><a href="/over#team">Team</a>',
    },
    "https://www.example.com/over": { status: 200, body: "<h1>Over</h1>" },
  });

  const result = await crawlSite("https://www.example.com/", {
    deps: { fetchFn: mockFetch(routes), lookupFn },
    maxUrls: 50,
    maxDepth: 1,
    log: () => undefined,
  });

  // Fragments are client-side navigation: "/#pricing" must resolve to "/"
  // (already visited) and "/over#team" to "/over". No fragment URLs crawled.
  assert.equal(result.pages.length, 2);
  assert.equal(result.failedUrls.length, 0);
  for (const page of result.pages) {
    assert.ok(!page.url.includes("#"), `fragment URL must not be crawled: ${page.url}`);
  }
  assert.ok(result.pages.some((p) => p.url === "https://www.example.com/"));
  assert.ok(result.pages.some((p) => p.url === "https://www.example.com/over"));
});

test("crawler never fetches the same URL twice (duplicate enqueue prevention)", async () => {
  const routes = baseRoutes({
    "https://www.example.com/": {
      status: 200,
      body: '<a href="/paginA">A</a><a href="/paginA">A2</a><a href="/paginA">A3</a><a href="/ander">Ander</a>',
    },
    "https://www.example.com/paginA": { status: 200, body: "<h1>A</h1>" },
    "https://www.example.com/ander": { status: 200, body: "<h1>Ander</h1>" },
  });

  const result = await crawlSite("https://www.example.com/", {
    deps: { fetchFn: mockFetch(routes), lookupFn },
    maxUrls: 50,
    maxDepth: 1,
    log: () => undefined,
  });

  assert.equal(result.pages.length, 3); // /, /paginA, /ander — paginA exactly once
  const urls = result.pages.map((p) => p.url);
  assert.equal(new Set(urls).size, urls.length, "no duplicate page URLs");
  assert.equal(urls.filter((u) => u === "https://www.example.com/paginA").length, 1);
});
