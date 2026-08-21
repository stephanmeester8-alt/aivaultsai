import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONSENT_STORAGE_KEY,
  consentDefaults,
  createConsentManager,
  type ConsentStorage,
} from "../lib/traffic/consent.ts";
import { isAnalyticsConfigured } from "../lib/analytics/gtag.ts";

function memoryStorage(initial: string | null = null): ConsentStorage & { value: string | null } {
  const store = { value: initial };
  return {
    get: () => store.value,
    set: (value: string) => {
      store.value = value;
    },
    get value() {
      return store.value;
    },
  };
}

test("default consent state is denied", () => {
  const manager = createConsentManager(memoryStorage());
  assert.equal(manager.getState(), "denied");
});

test("accept persists granted state", () => {
  const storage = memoryStorage();
  const manager = createConsentManager(storage);
  manager.grant();
  assert.equal(manager.getState(), "granted");
  assert.equal(storage.value, "granted");
});

test("reject persists denied state", () => {
  const storage = memoryStorage();
  const manager = createConsentManager(storage);
  manager.grant();
  manager.deny();
  assert.equal(manager.getState(), "denied");
  assert.equal(storage.value, "denied");
});

test("stored granted state is restored on load", () => {
  const manager = createConsentManager(memoryStorage("granted"));
  assert.equal(manager.getState(), "granted");
});

test("consent defaults are all denied", () => {
  const defaults = consentDefaults();
  assert.equal(defaults.analytics_storage, "denied");
  assert.equal(defaults.ad_storage, "denied");
  assert.equal(defaults.ad_user_data, "denied");
  assert.equal(defaults.ad_personalization, "denied");
});

test("GA4 is disabled when no measurement id is configured", () => {
  assert.equal(isAnalyticsConfigured({}), false);
  assert.equal(isAnalyticsConfigured({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-ABC123" }), true);
});

test("storage key is stable", () => {
  assert.equal(CONSENT_STORAGE_KEY, "aivaultsai_consent");
});
