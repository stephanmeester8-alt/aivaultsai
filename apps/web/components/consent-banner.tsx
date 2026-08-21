"use client";

import { useEffect, useState } from "react";

import {
  CONSENT_STORAGE_KEY,
  createConsentManager,
} from "@/lib/traffic/consent";
import { isAnalyticsConfigured, setConsentMode } from "@/lib/analytics/gtag";

/**
 * Minimal consent banner (Accept / Reject).
 * Only rendered when analytics is configured; otherwise absent entirely.
 * Consent state is persisted in localStorage.
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (!isAnalyticsConfigured()) return false;
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === null;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isAnalyticsConfigured()) return;
    // Apply the persisted decision on load (no state update here).
    if (window.localStorage.getItem(CONSENT_STORAGE_KEY) === "granted") {
      setConsentMode("granted");
    }
  }, []);

  if (!visible) return null;

  const decide = (granted: boolean) => {
    const manager = createConsentManager({
      get: () => window.localStorage.getItem(CONSENT_STORAGE_KEY),
      set: (value) => window.localStorage.setItem(CONSENT_STORAGE_KEY, value),
    });
    if (granted) manager.grant();
    else manager.deny();
    setConsentMode(granted ? "granted" : "denied");
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Privacy-instellingen"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-panel p-4 sm:flex sm:items-center sm:justify-between sm:gap-6"
    >
      <p className="max-w-3xl text-sm leading-relaxed text-mute">
        We gebruiken analytics om te begrijpen hoe bezoekers onze website
        vinden. Je kunt dit accepteren of weigeren; zonder toestemming wordt
        er geen analytics-data verzameld.
      </p>
      <div className="mt-3 flex shrink-0 gap-3 sm:mt-0">
        <button
          type="button"
          onClick={() => decide(true)}
          className="rounded-sm bg-ink px-4 py-2 text-sm font-medium text-canvas hover:bg-gold"
        >
          Accepteren
        </button>
        <button
          type="button"
          onClick={() => decide(false)}
          className="rounded-sm border border-line px-4 py-2 text-sm font-medium text-ink hover:border-gold/60"
        >
          Weigeren
        </button>
      </div>
    </div>
  );
}
