import assert from "node:assert/strict";
import { test } from "node:test";

import { serializeJsonLd } from "../lib/json-ld.ts";
import {
  ORGANIZATION_SCHEMA,
  SERVICES_SCHEMA,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  WEBSITE_SCHEMA,
} from "../lib/site.ts";

test("SITE_TITLE is the optimized title with length <= 60", () => {
  assert.equal(
    SITE_TITLE,
    "AIVaultsAI — Websites, AI-assistenten en leadautomatisering",
  );
  assert.ok(SITE_TITLE.length <= 60, `length is ${SITE_TITLE.length}`);
});

test("SITE_TITLE keeps brand, product lines and commercial intent", () => {
  for (const part of ["AIVaultsAI", "Websites", "AI-assistenten", "leadautomatisering"]) {
    assert.ok(SITE_TITLE.includes(part), `missing "${part}" in title`);
  }
});

test("Organization schema is truthful and minimal", () => {
  assert.equal(ORGANIZATION_SCHEMA["@context"], "https://schema.org");
  assert.equal(ORGANIZATION_SCHEMA["@type"], "Organization");
  assert.equal(ORGANIZATION_SCHEMA.name, "AIVaultsAI");
  assert.equal(ORGANIZATION_SCHEMA.name, SITE_NAME);
  assert.equal(ORGANIZATION_SCHEMA.url, SITE_URL);
  assert.deepEqual(Object.keys(ORGANIZATION_SCHEMA).sort(), [
    "@context",
    "@type",
    "name",
    "url",
  ]);
});

test("WebSite schema is truthful and minimal (no SearchAction)", () => {
  assert.equal(WEBSITE_SCHEMA["@context"], "https://schema.org");
  assert.equal(WEBSITE_SCHEMA["@type"], "WebSite");
  assert.equal(WEBSITE_SCHEMA.name, "AIVaultsAI");
  assert.equal(WEBSITE_SCHEMA.url, SITE_URL);
  assert.deepEqual(Object.keys(WEBSITE_SCHEMA).sort(), [
    "@context",
    "@type",
    "name",
    "url",
  ]);
  assert.ok(!("SearchAction" in WEBSITE_SCHEMA));
});

test("serializeJsonLd produces valid JSON", () => {
  const serialized = serializeJsonLd(ORGANIZATION_SCHEMA);
  assert.deepEqual(JSON.parse(serialized), ORGANIZATION_SCHEMA);
});

test("serializeJsonLd escapes script-breaking sequences", () => {
  const serialized = serializeJsonLd({
    name: "</script><script>alert(1)</script>",
  });
  assert.ok(!serialized.includes("</script"), "must not contain raw </script");
  assert.ok(serialized.includes("\\u003c"));
});

test("Services schema lists the three offerings truthfully", () => {
  assert.equal(SERVICES_SCHEMA["@context"], "https://schema.org");
  assert.equal(SERVICES_SCHEMA["@type"], "ItemList");
  const services = SERVICES_SCHEMA.itemListElement;
  assert.equal(services.length, 3);
  assert.deepEqual(
    services.map((s) => s.name),
    ["AIVaults Web", "AIVaults AI", "AIVaults Flow"],
  );
  for (const service of services) {
    assert.equal(service["@type"], "Service");
    assert.ok(service.position >= 1 && service.position <= 3);
    assert.ok(typeof service.serviceType === "string");
    assert.ok(service.description.length > 0);
    assert.equal(service.provider.name, "AIVaultsAI");
    assert.equal(service.provider.url, SITE_URL);
    assert.ok(!("offers" in service), "no price data in schema (drift risk)");
    assert.ok(!("aggregateRating" in service), "no ratings in schema");
  }
});
