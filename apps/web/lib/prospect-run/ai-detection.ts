/**
 * Deterministic AI-assistant / chatbot detection (TASK: AI Assistant Detection).
 *
 * Combines multiple signals from fetched HTML:
 * - known chat-widget providers (script/domain signatures)
 * - iframe widget signatures
 * - chatbot DOM markers (launchers, containers, aria/roles)
 * - visible chat / AI-assistant texts (weak signals only)
 *
 * Output is YES | NO | UNKNOWN with confidence and mandatory evidence.
 * Weak text alone never produces YES: the detector must not guess.
 * An LLM may later interpret the evidence, but it may never claim proof the
 * page did not provide.
 */

export type AiDetectionStatus = "yes" | "no" | "unknown";

export interface AiDetectionEvidence {
  type: string;
  source: string;
  detail: string;
}

export interface AiDetectionResult {
  status: AiDetectionStatus;
  confidence: number;
  evidence: AiDetectionEvidence[];
  detectedTechnologies: string[];
  checkedPages: string[];
}

export interface ChatProviderSignature {
  provider: string;
  /** Regexes matched against the full HTML document (lowercased). */
  patterns: RegExp[];
  /** Iframe-src markers (lowercased substring of the src attribute). */
  iframeMarkers?: string[];
}

export const CHAT_PROVIDER_SIGNATURES: readonly ChatProviderSignature[] = [
  { provider: "Intercom", patterns: [/widget\.intercom\.io/i, /intercomcdn\.com/i, /intercomSettings/i] },
  { provider: "Drift", patterns: [/js\.driftt\.com/i, /drift\.app/i] },
  { provider: "Zendesk", patterns: [/static\.zdassets\.com/i, /ekr\.zdassets\.com/i, /zopim/i, /ze\.page/i] },
  { provider: "Crisp", patterns: [/client\.crisp\.chat/i, /crisp\.chat/i], iframeMarkers: ["client.crisp.chat"] },
  { provider: "Tidio", patterns: [/code\.tidio\.co/i, /tidiochat/i] },
  { provider: "HubSpot Chat", patterns: [/js\.hs-scripts\.com/i, /hsforms/i, /hubspot.*chatflow/i] },
  { provider: "Tawk.to", patterns: [/embed\.tawk\.to/i, /tawkto/i], iframeMarkers: ["embed.tawk.to"] },
  { provider: "LiveChat", patterns: [/cdn\.livechatinc\.com/i, /livechatinc/i], iframeMarkers: ["cdn.livechatinc.com"] },
  { provider: "Freshchat", patterns: [/wchat\.freshchat\.com/i, /freshchat/i] },
  { provider: "Gorgias", patterns: [/config\.gorgias\.chat/i, /gorgias\.chat/i] },
  { provider: "Smartsupp", patterns: [/cdn\.smartsupp\.com/i, /smartsuppchat/i] },
  { provider: "Userlike", patterns: [/userlike\.js/i, /userlike-cdn/i] },
  { provider: "HelpScout", patterns: [/beacon-v2\.helpscout\.net/i, /helpscout\.net.*beacon/i] },
  { provider: "Chatbase", patterns: [/chatbase\.co/i, /chatbase\.co\/embed/i], iframeMarkers: ["chatbase.co/embed"] },
  { provider: "Voiceflow", patterns: [/cdn\.voiceflow\.com/i, /voiceflow\.com\/widget/i], iframeMarkers: ["cdn.voiceflow.com"] },
  { provider: "Botpress", patterns: [/cdn\.botpress\.cloud/i, /botpress\.cloud/i] },
  { provider: "ManyChat", patterns: [/manychat\.com/i, /widget\.manychat\.com/i] },
  { provider: "Respond.io", patterns: [/respond\.io/i, /widget\.respond\.io/i] },
  { provider: "Zoho SalesIQ", patterns: [/salesiq\.zoho\.com/i, /salesiq\.zoho\.eu/i] },
  { provider: "Olark", patterns: [/static\.olark\.com/i, /olark\.com/i] },
  { provider: "Textline", patterns: [/textline\.com.*widget/i] },
  { provider: "Tymely", patterns: [/tyme.ly/i] },
];

/** Strong DOM markers: chat launchers/containers with stable, vendor-like ids. */
const DOM_STRONG_MARKERS: ReadonlyArray<{ marker: RegExp; detail: string }> = [
  { marker: /intercom-launcher/i, detail: "intercom launcher element" },
  { marker: /crisp-client/i, detail: "crisp client container" },
  { marker: /tidio-chat/i, detail: "tidio chat container" },
  { marker: /tawkto-iframe-container/i, detail: "tawk.to iframe container" },
  { marker: /hubspot-conversations-iframe/i, detail: "hubspot conversations iframe" },
  { marker: /chat-widget/i, detail: "chat widget container" },
  { marker: /chatbot-container/i, detail: "chatbot container" },
  { marker: /chat-launcher/i, detail: "chat launcher element" },
  { marker: /(?:^|["'\s])launcher-button/i, detail: "chat launcher button" },
  { marker: /data-testid=["'][^"']*chat[-_]/i, detail: "chat data-testid attribute" },
];

/** Weak signals: visible copy. Never sufficient alone for YES. */
const WEAK_TEXT_MARKERS: ReadonlyArray<{ marker: RegExp; detail: string }> = [
  { marker: /\bchat with us\b/i, detail: "chat with us copy" },
  { marker: /\bchat with our\b/i, detail: "chat with our copy" },
  { marker: /\blive chat\b/i, detail: "live chat copy" },
  { marker: /\bstart a chat\b/i, detail: "start a chat copy" },
  { marker: /\bask our ai\b/i, detail: "ask our AI copy" },
  { marker: /\bai assistant\b/i, detail: "AI assistant copy" },
  { marker: /\bai-assistent\b/i, detail: "AI-assistent copy" },
  { marker: /\bchatbot\b/i, detail: "chatbot copy" },
  { marker: /\bhow can i help you\b/i, detail: "how can I help you copy" },
  { marker: /\bhoe kan ik je helpen\b/i, detail: "hoe kan ik je helpen copy" },
  { marker: /\bstart chat\b/i, detail: "start chat copy" },
  { marker: /\bsend us a message\b/i, detail: "send us a message copy" },
];

/** Strip quotes/attributes so only visible-ish text tokens remain. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function findIframeSignatures(html: string): Array<{ provider: string; detail: string }> {
  const found: Array<{ provider: string; detail: string }> = [];
  const iframeRe = /<iframe[^>]*\bsrc=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = iframeRe.exec(html)) !== null) {
    const src = match[1]!.toLowerCase();
    for (const signature of CHAT_PROVIDER_SIGNATURES) {
      if (signature.iframeMarkers?.some((marker) => src.includes(marker))) {
        found.push({ provider: signature.provider, detail: `iframe src: ${src.slice(0, 120)}` });
      }
    }
  }
  return found;
}

const MIN_TEXT_FOR_NO = 300;

/**
 * Classify a fetched page. `html` is the raw page, `pageUrl` the final URL.
 * Never throws: any anomaly yields UNKNOWN with evidence.
 */
export function detectAiAssistant(html: string, pageUrl: string): AiDetectionResult {
  const checkedPages = [pageUrl];
  const evidence: AiDetectionEvidence[] = [];
  const detectedTechnologies: string[] = [];
  const lowerHtml = html.toLowerCase();
  const text = visibleText(html);

  // 1. Strong: provider script/domain signatures.
  for (const signature of CHAT_PROVIDER_SIGNATURES) {
    if (signature.patterns.some((pattern) => pattern.test(lowerHtml))) {
      detectedTechnologies.push(signature.provider);
      evidence.push({
        type: "chat_provider_script",
        source: pageUrl,
        detail: `${signature.provider} script signature found`,
      });
    }
  }

  // 2. Strong: iframe widget signatures.
  for (const iframe of findIframeSignatures(lowerHtml)) {
    detectedTechnologies.push(iframe.provider);
    evidence.push({
      type: "chat_widget_iframe",
      source: pageUrl,
      detail: iframe.detail,
    });
  }

  // 3. Strong: DOM markers.
  for (const { marker, detail } of DOM_STRONG_MARKERS) {
    if (marker.test(lowerHtml)) {
      evidence.push({ type: "chat_dom_marker", source: pageUrl, detail });
    }
  }

  // 4. Weak: visible copy.
  const weakHits: string[] = [];
  for (const { marker, detail } of WEAK_TEXT_MARKERS) {
    if (marker.test(text)) {
      weakHits.push(detail);
      evidence.push({ type: "chat_visible_text", source: pageUrl, detail });
    }
  }

  const strong = evidence.filter((e) => e.type !== "chat_visible_text").length;
  const weak = weakHits.length;

  if (strong > 0) {
    const confidence = Math.min(0.98, 0.9 + (strong - 1) * 0.03);
    return {
      status: "yes",
      confidence: Number(confidence.toFixed(2)),
      evidence,
      detectedTechnologies: [...new Set(detectedTechnologies)],
      checkedPages,
    };
  }

  if (weak > 0) {
    // Visible chat copy exists but no widget could be proven: do not guess.
    const confidence = Math.min(0.6, 0.45 + weak * 0.05);
    return {
      status: "unknown",
      confidence: Number(confidence.toFixed(2)),
      evidence,
      detectedTechnologies,
      checkedPages,
    };
  }

  if (text.length >= MIN_TEXT_FOR_NO) {
    return {
      status: "no",
      confidence: 0.6,
      evidence: [
        ...evidence,
        {
          type: "absence",
          source: pageUrl,
          detail: `no chat/AI widget signals on ${text.length} chars of visible content`,
        },
      ],
      detectedTechnologies,
      checkedPages,
    };
  }

  return {
    status: "unknown",
    confidence: 0.3,
    evidence: [
      ...evidence,
      {
        type: "insufficient_content",
        source: pageUrl,
        detail: `only ${text.length} chars of visible content; cannot conclude`,
      },
    ],
    detectedTechnologies,
    checkedPages,
  };
}
