/**
 * OpenAI Responses API analyzer for prospect intelligence (continuation of
 * the controlled prospect-run pipeline).
 *
 * Contract:
 * - The model enriches prospect intelligence from SANITIZED context only.
 *   The agent already strips decisionMakerName / verifiedBusinessEmail and
 *   redacts public/crm signals; this module additionally redacts free-text
 *   pain points and re-sanitizes every string before it leaves the process.
 * - Fail-safe: a missing key, network failure, timeout, non-OK status or
 *   malformed response ALWAYS falls back to the deterministic
 *   `inferProspectIntelligence` baseline. The analyzer never throws into the
 *   run workflow and never invents evidence.
 * - The API key is read lazily from process.env.OPENAI_API_KEY so the module
 *   stays importable and testable without any secret configured.
 */

import type { ProspectInput, ProspectIntelligence } from "./types.ts";
import { inferProspectIntelligence } from "./prospect-agent.ts";
import { sanitizeIntelligenceContext } from "./policy.ts";

export interface OpenAiAnalyzerOptions {
  /** Overrides process.env.OPENAI_API_KEY. Never logged. */
  apiKey?: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  /** Injectable fetch for unit tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

export interface ProspectAnalyzer {
  (input: ProspectInput): Promise<ProspectIntelligence>;
}

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 20_000;

/** Strict JSON schema for the Responses API json_schema output format. */
const INTELLIGENCE_SCHEMA = {
  type: "object",
  properties: {
    pains: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    commercialOpportunity: { type: "number" },
    evidenceBaseline: { type: "number" },
    uncertainty: { type: "number" },
  },
  required: [
    "pains",
    "evidence",
    "unknowns",
    "commercialOpportunity",
    "evidenceBaseline",
    "uncertainty",
  ],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = [
  "You enrich a B2B prospect profile for an outreach pipeline.",
  "Identify concrete pain points, supporting evidence, and remaining unknowns from the context only.",
  "Never invent evidence: absent signals must be listed in unknowns, never asserted as facts.",
  "Score each component 0-100: commercialOpportunity (opportunity size), evidenceBaseline (verifiable signals), uncertainty (remaining gaps; higher = more unknown).",
  "Return strictly the JSON object matching the provided schema.",
].join(" ");

function buildPrompt(input: ProspectInput): string {
  const lines: string[] = [
    `Company: ${input.companyName}`,
    `Website: ${input.websiteUrl}`,
  ];
  if (input.industry) lines.push(`Industry: ${input.industry}`);
  if (input.employeeCount) lines.push(`Employees: ${input.employeeCount}`);
  if (input.knownPainPoints?.length) {
    lines.push(
      `Stated pain points: ${input.knownPainPoints.map(sanitizeIntelligenceContext).join("; ")}`,
    );
  }
  if (input.publicSignals?.length) {
    lines.push(`Public signals: ${input.publicSignals.map(sanitizeIntelligenceContext).join("; ")}`);
  }
  if (input.crmSignals?.length) {
    lines.push(`CRM signals: ${input.crmSignals.map(sanitizeIntelligenceContext).join("; ")}`);
  }
  return lines.join("\n");
}

function toBoundedInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** Extract the first output_text part of a Responses API payload. */
export function extractResponsesText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const candidate = part as { type?: unknown; text?: unknown };
      if (candidate.type === "output_text" && typeof candidate.text === "string") {
        return candidate.text;
      }
    }
  }
  return null;
}

/** Parse and validate a Responses API payload into intelligence (or null). */
export function parseIntelligenceResponse(data: unknown): ProspectIntelligence | null {
  const text = extractResponsesText(data);
  if (!text) return null;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  const pains = toStringArray(obj.pains);
  const evidence = toStringArray(obj.evidence);
  const unknowns = toStringArray(obj.unknowns);
  // A response with neither pains nor evidence carries no usable signal;
  // treat it as unparseable so the deterministic baseline is used instead.
  if (pains.length === 0 && evidence.length === 0) return null;

  return {
    pains,
    evidence,
    unknowns,
    commercialOpportunity: toBoundedInt(obj.commercialOpportunity, 25),
    evidenceBaseline: toBoundedInt(obj.evidenceBaseline, 15),
    uncertainty: toBoundedInt(obj.uncertainty, 40),
  };
}

/**
 * Build the production analyzer: OpenAI enrichment with a deterministic,
 * non-fatal fallback. Safe to call without any key configured.
 */
export function createProspectAnalyzer(
  options: OpenAiAnalyzerOptions = {},
): ProspectAnalyzer {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const model = options.model ?? DEFAULT_MODEL;
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? ((message: string) => console.info(`[prospect-run] ${message}`));

  return async (input: ProspectInput): Promise<ProspectIntelligence> => {
    if (!apiKey) {
      log("intelligence source: deterministic fallback (no OPENAI_API_KEY)");
      return inferProspectIntelligence(input);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: INSTRUCTIONS,
          input: buildPrompt(input),
          text: {
            format: {
              type: "json_schema",
              name: "prospect_intelligence",
              schema: INTELLIGENCE_SCHEMA,
              strict: true,
            },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        log(`intelligence source: openai http ${response.status} -> deterministic fallback`);
        return inferProspectIntelligence(input);
      }

      const parsed = parseIntelligenceResponse(await response.json());
      if (!parsed) {
        log("intelligence source: openai unparseable output -> deterministic fallback");
        return inferProspectIntelligence(input);
      }
      log("intelligence source: openai responses api");
      return parsed;
    } catch (error) {
      log(
        `intelligence source: openai ${error instanceof Error ? error.name : "unknown"} -> deterministic fallback`,
      );
      return inferProspectIntelligence(input);
    } finally {
      clearTimeout(timer);
    }
  };
}
