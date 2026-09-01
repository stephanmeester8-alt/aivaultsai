import assert from "node:assert/strict";
import { test } from "node:test";

import {
  StaticListDiscoveryProvider,
  dedupeCompanies,
  extractDomain,
  isValidPublicDomain,
  normalizeCompanyName,
  validateCompanies,
} from "../lib/prospect-run/discovery.ts";

test("static list provider returns candidates with a stable source", async () => {
  const provider = new StaticListDiscoveryProvider([
    { name: "Acme BV", websiteUrl: "https://acme.nl" },
  ]);
  assert.equal(provider.source, "manual_list");
  const companies = await provider.discover();
  assert.equal(companies.length, 1);
  assert.equal(companies[0]!.name, "Acme BV");
});

test("company name normalization trims and collapses whitespace", () => {
  assert.equal(normalizeCompanyName("  Acme   BV  "), "Acme BV");
  assert.equal(normalizeCompanyName('"Acme BV"'), "Acme BV");
  assert.equal(normalizeCompanyName(""), "");
});

test("domain extraction normalizes scheme, www, path and case", () => {
  assert.equal(extractDomain("https://www.Example.com/path?q=1"), "example.com");
  assert.equal(extractDomain("http://example.nl"), "example.nl");
  assert.equal(extractDomain("https://sub.example.co.uk"), "sub.example.co.uk");
  assert.equal(extractDomain(undefined), null);
  assert.equal(extractDomain(""), null);
  assert.equal(extractDomain("ftp://example.com"), null);
  assert.equal(extractDomain("javascript:alert(1)"), null);
  assert.equal(extractDomain("http://localhost:3000"), null);
  assert.equal(extractDomain("http://127.0.0.1"), null);
  assert.equal(extractDomain("http://192.168.1.1"), null);
  assert.equal(extractDomain("http://10.0.0.5"), null);
});

test("public domain validation rejects non-public hosts", () => {
  assert.equal(isValidPublicDomain("example.com"), true);
  assert.equal(isValidPublicDomain("sub.example.co.uk"), true);
  assert.equal(isValidPublicDomain("localhost"), false);
  assert.equal(isValidPublicDomain("127.0.0.1"), false);
  assert.equal(isValidPublicDomain("example"), false);
  assert.equal(isValidPublicDomain("192.168.1.1"), false);
  assert.equal(isValidPublicDomain(""), false);
});

test("dedupe removes duplicate domains and duplicate names", () => {
  const companies = [
    { name: "Acme BV", websiteUrl: "https://www.acme.nl" },
    { name: "Acme BV (dubble)", websiteUrl: "https://acme.nl" },
    { name: "Beta BV" },
    { name: "beta bv" },
    { name: "Gamma BV", websiteUrl: "https://gamma.com" },
  ];
  const deduped = dedupeCompanies(companies);
  assert.equal(deduped.length, 3);
  const names = deduped.map((c) => c.name).sort();
  assert.deepEqual(names, ["Acme BV", "Beta BV", "Gamma BV"]);
  assert.equal(deduped[0]!.name, "Acme BV"); // domain-grouped candidates come first
});

test("validateCompanies splits valid from rejected with reasons", () => {
  const { valid, rejected } = validateCompanies([
    { name: "  Acme   BV ", websiteUrl: "https://www.acme.nl" },
    { name: "", websiteUrl: "https://empty.com" },
    { name: "Bad URL", websiteUrl: "not-a-url" },
    { name: "Localhost", websiteUrl: "http://localhost:3000" },
    { name: "Private IP", websiteUrl: "http://10.0.0.1" },
    { name: "Beta BV", websiteUrl: "https://beta.nl", industry: " SaaS ", location: " Amsterdam " },
  ]);
  assert.equal(valid.length, 2);
  assert.equal(valid[0]!.name, "Acme BV");
  assert.equal(valid[1]!.industry, "SaaS");
  assert.equal(valid[1]!.location, "Amsterdam");
  assert.equal(rejected.length, 4);
  const reasons = rejected.map((r) => r.reason);
  assert.ok(reasons.some((r) => r.startsWith("EMPTY_COMPANY_NAME")));
  assert.ok(reasons.some((r) => r.startsWith("INVALID_URL")));
  assert.ok(reasons.some((r) => r === "NON_PUBLIC_HOST"));
});
