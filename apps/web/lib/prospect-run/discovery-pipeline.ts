/**
 * Discovery pipeline (TASK: Prospect Discovery + AI Detection).
 *
 * Wires the new layers onto the EXISTING Prospect Run — nothing is rebuilt:
 *
 *   sources → validate/dedupe → website research (guarded fetch)
 *   → deterministic AI detection (evidence) → companies upsert (idempotent)
 *   → ProspectInput → existing createProspectRun + runProspectAgent
 *     (existing scoring / route matching / OpenAI analyzer)
 *
 * Every stage is non-fatal per company; errors are recorded in the outcome
 * and audit evidence, never thrown into the run workflow.
 */

import { createProspectAnalyzer } from "./openai-analyzer.ts";
import { runProspectAgent } from "./prospect-agent.ts";
import { sanitizeIntelligenceContext } from "./policy.ts";
import {
  claimProspectRun,
  createProspectRun,
  persistRunManifest,
} from "./repository.ts";
import {
  dedupeCompanies,
  extractDomain,
  validateCompanies,
  type DiscoveredCompany,
} from "./discovery.ts";
import {
  hasFreshResearch,
  upsertCompany,
  type DiscoverySql,
} from "./discovery-repository.ts";
import {
  detectAiAssistant,
  type AiDetectionResult,
} from "./ai-detection.ts";
import {
  researchWebsite,
  type CrawlStatus,
  type WebsiteResearchDeps,
} from "./website-research.ts";
import type { ProspectIntelligence, ProspectInput } from "./types.ts";

export interface DiscoveryRunOptions {
  companies: readonly DiscoveredCompany[];
  tenantId: string;
  /** Max companies researched per run (bounds latency/cost). */
  limit?: number;
  /** Skip re-research for domains checked within this window. */
  freshnessHours?: number;
  source?: string;
}

export interface DiscoveryPipelineDeps extends WebsiteResearchDeps {
  sql: DiscoverySql;
  /** Reuses the existing OpenAI intelligence analyzer by default. */
  analyze?: (input: ProspectInput) => Promise<ProspectIntelligence>;
  log?: (message: string) => void;
}

export interface CompanyOutcome {
  domain: string;
  companyName: string;
  companyId?: string;
  cached: boolean;
  research: { status: CrawlStatus; httpStatus: number | null; errors: string[] };
  aiDetection: AiDetectionResult | null;
  prospect: { runId?: string; state?: string } | null;
  error?: string;
}

export interface DiscoveryRunSummary {
  source: string;
  discovered: number;
  processed: number;
  rejected: Array<{ company: string; reason: string }>;
  outcomes: CompanyOutcome[];
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const DEFAULT_FRESHNESS_HOURS = 24;

/** Build the ProspectInput handed to the existing Prospect Run pipeline. */
export function buildProspectInput(
  company: DiscoveredCompany,
  websiteUrl: string,
  detection: AiDetectionResult | null,
  title: string | null,
  textExcerpt: string,
): ProspectInput {
  const signals: string[] = [];
  if (title) signals.push(`website title: ${title}`);
  if (detection) {
    signals.push(
      `AI assistant detection: ${detection.status} (confidence ${detection.confidence})`,
    );
    for (const item of detection.evidence.slice(0, 5)) {
      signals.push(`detection evidence: ${item.detail}`);
    }
    for (const tech of detection.detectedTechnologies.slice(0, 5)) {
      signals.push(`detected technology: ${tech}`);
    }
  }
  const excerpt = textExcerpt.trim();
  if (excerpt) signals.push(`website content: ${excerpt.slice(0, 500)}`);

  return {
    companyName: company.name,
    websiteUrl,
    industry: company.industry,
    publicSignals: signals.map(sanitizeIntelligenceContext),
    knownPainPoints: [],
  };
}

/**
 * Run the discovery pipeline. Idempotent per domain: fresh companies are
 * skipped and prospect runs are created with a stable idempotency key
 * (`discovery:<domain>`), so re-runs never create duplicates.
 */
export async function runDiscoveryPipeline(
  options: DiscoveryRunOptions,
  deps: DiscoveryPipelineDeps,
): Promise<DiscoveryRunSummary> {
  const log = deps.log ?? ((message: string) => console.info(`[prospect-discovery] ${message}`));
  const analyze = deps.analyze ?? createProspectAnalyzer();
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const freshnessMs = (options.freshnessHours ?? DEFAULT_FRESHNESS_HOURS) * 3_600_000;
  const source = options.source ?? "manual_list";

  const { valid, rejected } = validateCompanies(options.companies);
  const companies = dedupeCompanies(valid).slice(0, limit);
  log(`discovery started: ${valid.length} valid candidates, ${rejected.length} rejected, limit ${limit}`);

  const outcomes: CompanyOutcome[] = [];

  for (const company of companies) {
    const websiteUrl = company.websiteUrl;
    const domain = extractDomain(websiteUrl);
    if (!websiteUrl || !domain) {
      outcomes.push({
        domain: "unknown",
        companyName: company.name,
        cached: false,
        research: { status: "error", httpStatus: null, errors: ["NO_WEBSITE_URL"] },
        aiDetection: null,
        prospect: null,
        error: "NO_WEBSITE_URL",
      });
      continue;
    }

    try {
      if (await hasFreshResearch(deps.sql, domain, freshnessMs)) {
        log(`company cached, skipped research: ${domain}`);
        outcomes.push({
          domain,
          companyName: company.name,
          cached: true,
          research: { status: "ok", httpStatus: null, errors: [] },
          aiDetection: null,
          prospect: null,
        });
        continue;
      }

      log(`website research started: ${domain}`);
      const research = await researchWebsite(websiteUrl, {
        fetchImpl: deps.fetchImpl,
        lookup: deps.lookup,
        timeoutMs: deps.timeoutMs,
        maxBytes: deps.maxBytes,
        maxRedirects: deps.maxRedirects,
        maxTextChars: deps.maxTextChars,
        now: deps.now,
      });
      if (research.status !== "ok") {
        log(`website research failed: ${domain} (${research.errors.join("; ")})`);
      }

      let detection: AiDetectionResult | null = null;
      if (research.status === "ok" && research.html) {
        detection = detectAiAssistant(research.html, research.url);
        log(
          `AI detection result: ${domain} -> ${detection.status} (confidence ${detection.confidence}, ${detection.evidence.length} evidence items)`,
        );
      }

      const { companyId } = await upsertCompany(deps.sql, {
        name: company.name,
        domain,
        industry: company.industry,
        location: company.location,
        discoverySource: source,
        websiteResearch: research,
        aiDetection: detection,
      });

      const input = buildProspectInput(
        company,
        research.url,
        detection,
        research.title,
        research.text,
      );
      const runId = await createProspectRun(
        deps.sql,
        input,
        "HUMAN_REVIEW",
        options.tenantId,
        `discovery:${domain}`,
      );
      const result = await runProspectAgent(runId, input, "HUMAN_REVIEW", {
        claimRun: (id) => claimProspectRun(deps.sql, id),
        analyze,
        persistManifest: (manifest) => persistRunManifest(deps.sql, manifest),
      });
      log(`prospect created/updated: ${domain} -> run ${runId} (${result.state})`);

      outcomes.push({
        domain,
        companyName: company.name,
        companyId,
        cached: false,
        research: {
          status: research.status,
          httpStatus: research.httpStatus,
          errors: research.errors,
        },
        aiDetection: detection,
        prospect: { runId, state: result.state },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`company failed: ${domain} (${message})`);
      outcomes.push({
        domain,
        companyName: company.name,
        cached: false,
        research: { status: "error", httpStatus: null, errors: [message.slice(0, 300)] },
        aiDetection: null,
        prospect: null,
        error: message.slice(0, 300),
      });
    }
  }

  log(`discovery completed: ${outcomes.length} companies processed`);
  return {
    source,
    discovered: valid.length,
    processed: outcomes.length,
    rejected: rejected.map((entry) => ({ company: entry.company.name, reason: entry.reason })),
    outcomes,
  };
}
