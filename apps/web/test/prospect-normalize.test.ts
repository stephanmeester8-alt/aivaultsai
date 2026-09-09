import assert from "node:assert/strict";
import { test } from "node:test";

import {
  domainFromEmail,
  domainFromWebsite,
  normalizeEmail,
  normalizeWebsite,
  resolveDomainNormalized,
} from "../lib/prospect-pipeline/normalize.ts";

test("normalizeEmail: trim + lowercase", () => {
  assert.equal(normalizeEmail("  INFO@Voorbeeld.NL "), "info@voorbeeld.nl");
});

test("normalizeEmail: invalid input returns null", () => {
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail("geen-mail"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(undefined), null);
});

test("domainFromEmail: haalt domein achter @", () => {
  assert.equal(domainFromEmail("info@voorbeeld.nl"), "voorbeeld.nl");
  assert.equal(domainFromEmail("x@sub.example.co.uk"), "sub.example.co.uk");
});

test("domainFromWebsite: normaliseert scheme/www", () => {
  assert.equal(domainFromWebsite("https://www.Voorbeeld.NL/contact"), "voorbeeld.nl");
  assert.equal(domainFromWebsite("voorbeeld.nl"), "voorbeeld.nl");
});

test("domainFromWebsite: weigert ongeldige / lokale input", () => {
  assert.equal(domainFromWebsite("localhost"), null);
  assert.equal(domainFromWebsite("http://127.0.0.1/x"), null);
  assert.equal(domainFromWebsite("geen-domein"), null);
});

test("normalizeWebsite: alleen http(s), zonder credentials", () => {
  assert.equal(normalizeWebsite("https://voorbeeld.nl/contact"), "https://voorbeeld.nl/contact");
  assert.equal(normalizeWebsite("https://user:pass@voorbeeld.nl"), null);
  assert.equal(normalizeWebsite("javascript:alert(1)"), null);
});

test("resolveDomainNormalized: e-mail wint, website als fallback", () => {
  assert.equal(
    resolveDomainNormalized({
      emailNormalized: "info@voorbeeld.nl",
      website: "https://anders.nl",
    }),
    "voorbeeld.nl",
  );
  assert.equal(
    resolveDomainNormalized({ emailNormalized: null, website: "https://voorbeeld.nl" }),
    "voorbeeld.nl",
  );
  assert.equal(resolveDomainNormalized({ emailNormalized: null, website: null }), null);
});
