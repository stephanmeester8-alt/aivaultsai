import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { CONTACT_EMAIL } from "../lib/site.ts";
import { SERVICE_PAGES } from "../lib/service-pages.ts";

const OFFICIAL_EMAIL = "info@aivaultsai.nl";
const LEGACY_EMAIL = "aivaultsai@gmail.com";

function walkFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkFiles(full).forEach((f) => files.push(f));
    else files.push(full);
  }
  return files;
}

test("contact: officieel publiek contactadres is info@aivaultsai.nl", () => {
  assert.equal(CONTACT_EMAIL, OFFICIAL_EMAIL);
});

test("contact: dienstenpagina-mailto verwijst naar het officiële adres (geen gmail)", () => {
  for (const page of SERVICE_PAGES) {
    assert.ok(
      page.secondaryCta.href.startsWith(`mailto:${OFFICIAL_EMAIL}`),
      `${page.slug} secondaryCta moet mailto:${OFFICIAL_EMAIL} zijn`,
    );
    assert.equal(page.secondaryCta.href.includes(LEGACY_EMAIL), false);
  }
});

test("contact: geen oud publiek adres (aivaultsai@gmail.com) in productiecode", () => {
  const root = join(import.meta.dirname, "..");
  const scanned: string[] = [];
  for (const area of ["components", "lib", "app"]) {
    for (const file of walkFiles(join(root, area))) {
      if (!/\.(ts|tsx|mjs)$/.test(file)) continue;
      const content = readFileSync(file, "utf8");
      scanned.push(file);
      assert.equal(
        content.includes(LEGACY_EMAIL),
        false,
        `oud adres gevonden in ${file.replace(root, "")}`,
      );
    }
  }
  assert.ok(scanned.length > 30, `verwacht veel bestanden gescand, kreeg ${scanned.length}`);
});

test("contact: assistant-prompt kent het officiële adres en belooft niets onwaars", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "app", "api", "assistant", "route.ts"), "utf8");
  assert.ok(route.includes(OFFICIAL_EMAIL), "prompt moet info@aivaultsai.nl bevatten");
  assert.equal(route.includes(LEGACY_EMAIL), false);
  assert.ok(route.includes("Beweer nooit dat een e-mail is verstuurd"));
  assert.ok(route.includes("Beloof nooit dat iemand op een bepaald moment wordt teruggebeld"));
});

test("contact: .env.example documenteert LEAD_NOTIFICATION_EMAIL=info@aivaultsai.nl", () => {
  const example = readFileSync(join(import.meta.dirname, "..", ".env.example"), "utf8");
  assert.ok(example.includes("LEAD_NOTIFICATION_EMAIL=info@aivaultsai.nl"));
});
