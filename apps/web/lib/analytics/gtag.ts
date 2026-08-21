/**
 * GA4 analytics wrapper — analytics / observability ONLY.
 *
 * lead_events (business) remains the source of truth; GA4 never decides
 * whether a lead is created. No PII, no chat content, no free text is ever
 * sent. The measurement ID is loaded only when NEXT_PUBLIC_GA_MEASUREMENT_ID
 * exists; without it GA4 is fully disabled.
 *
 * GA_API_SECRET (Measurement Protocol) is server-side ONLY — never
 * NEXT_PUBLIC_*, never in the client bundle, never in HTML or logs.
 */

import type { CustomerZeroResult } from "../customer-zero/orchestrator";

export const GA_EVENTS = [
  "assistant_started",
  "commercial_intent_detected",
  "lead_created",
  "lead_qualified",
  "appointment_requested",
] as const;

export type GaEventName = (typeof GA_EVENTS)[number];

export interface AnalyticsEnv {
  NEXT_PUBLIC_GA_MEASUREMENT_ID?: string;
  GA_MEASUREMENT_ID?: string;
  GA_API_SECRET?: string;
}

export function isAnalyticsConfigured(env: AnalyticsEnv = process.env as AnalyticsEnv): boolean {
  return Boolean(env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
}

/**
 * Deterministic, browser-safe technical identifier hash.
 * Not a security mechanism — used only to avoid sending raw identifiers.
 */
export function hashId(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex =
    (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  return hex.slice(0, 12);
}

/** Consent Mode v2 defaults — everything denied until acceptance. */
export function ga4ConsentDefaults(): Record<string, string> {
  return {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
}

/* ------------------------- client-side (browser) ------------------------- */

type GtagFunction = (command: string, ...args: unknown[]) => void;

function gtag(): GtagFunction | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as { gtag?: unknown }).gtag;
  return typeof candidate === "function" ? (candidate as GtagFunction) : null;
}

/** Push Consent Mode v2 defaults before gtag config (default denied). */
export function initConsentMode(): void {
  const fn = gtag();
  if (!fn) return;
  fn("consent", "default", ga4ConsentDefaults());
}

/** Update consent state after explicit visitor choice. */
export function setConsentMode(state: "granted" | "denied"): void {
  const fn = gtag();
  if (!fn) return;
  fn("consent", "update", {
    analytics_storage: state,
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
  });
}

/** Type-safe client event; no-op when gtag is not loaded. */
export function trackClientEvent(name: GaEventName, params?: Record<string, unknown>): void {
  const fn = gtag();
  if (!fn) return;
  fn("event", name, params ?? {});
}

/** Inline init snippet for the layout (consent defaults + config). */
export function buildGtagInitScript(measurementId: string): string {
  const safeId = measurementId.replace(/[^a-zA-Z0-9-]/g, "");
  return [
    "window.dataLayer = window.dataLayer || [];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});",
    "gtag('js',new Date());",
    `gtag('config','${safeId}');`,
  ].join("");
}

/* ------------------------- server-side (Measurement Protocol) ------------- */

export function buildServerEventPayload(
  name: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  return { client_id: "aivaultsai-server", events: [{ name, params }] };
}

/**
 * Server-side GA4 event via Measurement Protocol. No-op when GA_MEASUREMENT_ID
 * or GA_API_SECRET are missing. Never throws (analytics must not break the
 * funnel). Never sends PII or chat content.
 */
export async function sendServerEvent(
  name: string,
  params: Record<string, unknown>,
  env: AnalyticsEnv = process.env as AnalyticsEnv,
): Promise<void> {
  const measurementId = env.GA_MEASUREMENT_ID;
  const apiSecret = env.GA_API_SECRET;
  if (!measurementId || !apiSecret) return;
  try {
    const url =
      `https://www.google-analytics.com/mp/collect?measurement_id=` +
      `${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildServerEventPayload(name, params)),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Analytics is observability; a failure must never affect business logic.
  }
}

/**
 * Fire funnel analytics events from the wiring layer (non-fatal). Only
 * hashed technical identifiers and intent levels are sent.
 */
export async function fireFunnelAnalytics(
  conversationId: string,
  result: CustomerZeroResult,
): Promise<void> {
  const conversationHash = hashId(conversationId);
  if (result.intent.detected) {
    await sendServerEvent("commercial_intent_detected", {
      conversation_id: conversationHash,
      intent_level: result.intent.level,
    });
  }
  if (result.leadCreated && result.leadId) {
    const leadHash = hashId(result.leadId);
    await sendServerEvent("lead_created", {
      conversation_id: conversationHash,
      lead_id: leadHash,
    });
    // Matches the orchestrator rule: QUALIFIED iff HIGH_COMMERCIAL_INTENT.
    if (result.intent.level === "HIGH_COMMERCIAL_INTENT") {
      await sendServerEvent("lead_qualified", {
        conversation_id: conversationHash,
        lead_id: leadHash,
      });
    }
  }
}
