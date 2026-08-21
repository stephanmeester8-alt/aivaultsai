/**
 * Consent state management (Consent Mode v2 defaults).
 *
 * Default is DENIED: no analytics cookies, no ad personalization until the
 * visitor explicitly accepts. Persisted in localStorage; the manager is
 * storage-injected so it is fully unit-testable.
 */

export const CONSENT_STORAGE_KEY = "aivaultsai_consent";

export type ConsentState = "granted" | "denied";

export interface ConsentStorage {
  get(): string | null;
  set(value: string): void;
}

export interface ConsentManager {
  getState(): ConsentState;
  grant(): void;
  deny(): void;
}

export function createConsentManager(storage: ConsentStorage): ConsentManager {
  return {
    getState(): ConsentState {
      return storage.get() === "granted" ? "granted" : "denied";
    },
    grant(): void {
      storage.set("granted");
    },
    deny(): void {
      storage.set("denied");
    },
  };
}

/** Consent Mode v2 defaults — everything denied until acceptance. */
export function consentDefaults(): Record<string, string> {
  return {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
}
