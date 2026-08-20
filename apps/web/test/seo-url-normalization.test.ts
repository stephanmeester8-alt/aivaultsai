import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeUrl, resolveUrl } from "../lib/seo/url-normalization.ts";

function eq(a: string, b: string): void {
  assert.equal(normalizeUrl(a), normalizeUrl(b), `${a} should equal ${b}`);
}

function ne(a: string, b: string): void {
  assert.notEqual(normalizeUrl(a), normalizeUrl(b), `${a} should differ from ${b}`);
}

test("root path: with and without trailing slash are equal", () => {
  eq("https://example.com", "https://example.com/");
});

test("host is normalized to lowercase", () => {
  eq("https://EXAMPLE.COM", "https://example.com");
  eq("https://Example.com/Path", "https://example.com/Path");
});

test("default ports are removed, non-default ports are kept", () => {
  eq("https://example.com:443", "https://example.com");
  eq("http://example.com:80", "http://example.com");
  ne("https://example.com:8443", "https://example.com");
});

test("trailing slash on non-root paths is normalized", () => {
  eq("https://example.com/about/", "https://example.com/about");
});

test("normalization is idempotent", () => {
  const normalized = normalizeUrl("https://EXAMPLE.com:443/about/");
  assert.equal(normalizeUrl(normalized), normalized);
});

test("fragments are dropped", () => {
  eq("https://example.com/page#section", "https://example.com/page");
});

test("query strings are preserved and not conflated with no query", () => {
  ne("https://example.com/page?a=1", "https://example.com/page");
  eq("https://example.com/page?a=1", "https://example.com/page?a=1");
  ne("https://example.com/page?a=1", "https://example.com/page?a=2");
});

test("different paths stay different", () => {
  ne("https://example.com/a", "https://example.com/b");
});

test("scheme differences are preserved", () => {
  ne("https://example.com", "http://example.com");
});

test("credentials are stripped from the normalized form", () => {
  eq("https://user:pass@example.com/page", "https://example.com/page");
  assert.ok(!normalizeUrl("https://user:secret@example.com/").includes("secret"));
});

test("invalid input is returned unchanged", () => {
  assert.equal(normalizeUrl("not a url"), "not a url");
});

test("resolveUrl resolves relative against a base", () => {
  assert.equal(resolveUrl("/about", "https://example.com/"), "https://example.com/about");
  assert.equal(resolveUrl("https://other.com/x", "https://example.com/"), "https://other.com/x");
  assert.equal(resolveUrl("http://exa mple.com", "https://example.com/"), null);
});
