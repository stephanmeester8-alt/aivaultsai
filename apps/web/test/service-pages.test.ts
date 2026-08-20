import assert from "node:assert/strict";
import { test } from "node:test";

import { SERVICE_PAGES, servicePageSchema } from "../lib/service-pages.ts";
import { SERVICES_SCHEMA } from "../lib/site.ts";

const BANNED = [
  "beste",
  "#1",
  "goedkoopste",
  "nummer één",
  "expert",
  "specialist",
  "premium",
  "AI agency Nederland",
];

const GENERIC_ANCHORS = ["klik hier", "lees meer", "meer informatie"];

function pageText(page: (typeof SERVICE_PAGES)[number]): string {
  return [
    page.title,
    page.h1,
    page.hero,
    page.definition,
    ...page.capabilities.flatMap((c) => [c.title, c.detail]),
    ...page.audience,
    ...page.howItWorks,
    ...page.faq.flatMap((f) => [f.question, f.answer]),
  ]
    .join(" ")
    .toLowerCase();
}

test("exactly three service pages are configured", () => {
  assert.deepEqual(
    SERVICE_PAGES.map((p) => p.slug),
    ["ai-assistenten", "leadautomatisering", "websites"],
  );
});

test("every page satisfies the SEO title contract (<= 60 chars, brand kept)", () => {
  for (const page of SERVICE_PAGES) {
    assert.ok(page.title.length <= 60, `${page.slug} title is ${page.title.length}`);
    assert.ok(page.title.includes("AIVaultsAI"), `${page.slug} keeps the brand`);
  }
});

test("every page has a non-empty description <= 160 chars", () => {
  for (const page of SERVICE_PAGES) {
    assert.ok(page.description.length > 0 && page.description.length <= 160, page.slug);
  }
});

test("every page has the required content sections", () => {
  for (const page of SERVICE_PAGES) {
    assert.ok(page.h1.length > 0, "h1");
    assert.ok(page.hero.length > 0, "hero");
    assert.ok(page.definition.length > 0, "definition");
    assert.ok(page.capabilities.length >= 3, "capabilities");
    assert.ok(page.audience.length >= 1, "audience");
    assert.ok(page.howItWorks.length >= 3, "howItWorks");
    assert.ok(page.faq.length >= 3, "faq");
  }
});

test("every page has clear CTAs and an assistant entry point", () => {
  for (const page of SERVICE_PAGES) {
    assert.ok(page.primaryCta.label.length > 0);
    assert.ok(page.secondaryCta.label.length > 0);
    assert.equal(page.primaryCta.href, "#live-ai", `${page.slug} primary CTA leads to the assistant`);
  }
});

test("no banned superlatives or keyword stuffing in page copy", () => {
  for (const page of SERVICE_PAGES) {
    const text = pageText(page);
    for (const banned of BANNED) {
      assert.ok(!text.includes(banned), `${page.slug}: banned "${banned}"`);
    }
    for (const generic of GENERIC_ANCHORS) {
      assert.ok(!text.includes(generic), `${page.slug}: generic "${generic}"`);
    }
  }
});

test("every page cross-links to the other two services", () => {
  const slugs = SERVICE_PAGES.map((p) => p.slug);
  for (const page of SERVICE_PAGES) {
    for (const other of slugs.filter((slug) => slug !== page.slug)) {
      assert.ok(
        page.related.some((link) => link.href === `/${other}`),
        `${page.slug} should link /${other}`,
      );
    }
  }
});

test("service page schemas are truthful and consistent with the catalog", () => {
  const catalogNames: string[] = SERVICES_SCHEMA.itemListElement.map((s) => s.name);
  for (const page of SERVICE_PAGES) {
    const schema = servicePageSchema(page);
    assert.equal(schema["@type"], "Service");
    assert.equal(schema.name, page.serviceName);
    assert.equal(schema.url, page.url);
    assert.equal(schema.provider.name, "AIVaultsAI");
    assert.ok(catalogNames.includes(page.serviceName), `${page.serviceName} must exist in the catalog`);
    assert.ok(!("offers" in schema), "no price data in schema");
    assert.ok(!("aggregateRating" in schema), "no ratings in schema");
  }
});

test("answers are evidence-backed: prices only use the known from-prices", () => {
  for (const page of SERVICE_PAGES) {
    const text = page.faq.map((f) => f.answer).join(" ");
    if (text.includes("€")) {
      assert.ok(
        /€\s*495|€\s*795|€\s*49|€\s*995/.test(text),
        `${page.slug}: price must be a known from-price`,
      );
    }
  }
});

test("every page has a valid absolute OG image (no localhost/private)", () => {
  for (const page of SERVICE_PAGES) {
    const og = page.ogImage;
    assert.ok(og.startsWith("https://"), `${page.slug}: og image must be absolute`);
    assert.ok(og.includes("aivaultsai.one"), `${page.slug}: og image must be on the AIVaultsAI domain`);
    assert.ok(og.endsWith("/opengraph-image"), `${page.slug}: og image must point at the shared OG route`);
    for (const forbidden of ["localhost", "127.0.0.1", "10.", "192.168.", "169.254."]) {
      assert.ok(!og.includes(forbidden), `${page.slug}: og image must not contain ${forbidden}`);
    }
  }
});
