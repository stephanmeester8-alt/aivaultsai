/**
 * Discovery persistence (TASK: Prospect Discovery + AI Detection).
 *
 * Companies are the discovery-level identity. All writes are idempotent:
 * the unique domain constraint plus ON CONFLICT make repeated discovery runs
 * safe. Research/detection payloads are stored as JSONB; `last_checked_at`
 * enables a freshness window so re-runs reuse valid data instead of
 * re-fetching (AI-cost and latency control).
 */

import type { AiDetectionResult } from "./ai-detection.ts";
import type { WebsiteResearchResult } from "./website-research.ts";

export type DiscoverySql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export interface UpsertCompanyInput {
  name: string;
  domain: string;
  industry?: string;
  location?: string;
  discoverySource: string;
  websiteResearch?: WebsiteResearchResult | null;
  aiDetection?: AiDetectionResult | null;
}

export interface CompanyRecord {
  companyId: string;
  name: string;
  domain: string;
  industry: string | null;
  location: string | null;
  discoverySource: string;
  websiteResearch: WebsiteResearchResult | null;
  aiDetection: AiDetectionResult | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

/**
 * Insert or update a company by domain. Returns the company id; `created`
 * tells the caller whether this run created the row (informational only —
 * correctness never depends on it).
 */
export async function upsertCompany(
  sql: DiscoverySql,
  input: UpsertCompanyInput,
): Promise<{ companyId: string; created: boolean }> {
  const inserted = await sql`
    INSERT INTO companies (
      name, domain, industry, location, discovery_source,
      website_research, ai_detection, last_checked_at
    )
    VALUES (
      ${input.name},
      ${input.domain},
      ${input.industry ?? null},
      ${input.location ?? null},
      ${input.discoverySource},
      ${input.websiteResearch ? JSON.stringify(input.websiteResearch) : null}::jsonb,
      ${input.aiDetection ? JSON.stringify(input.aiDetection) : null}::jsonb,
      NOW()
    )
    ON CONFLICT (domain) DO NOTHING
    RETURNING company_id
  `;
  const first = inserted[0] as { company_id?: string } | undefined;
  if (first?.company_id) {
    return { companyId: String(first.company_id), created: true };
  }

  const updated = await sql`
    UPDATE companies
    SET
      name = ${input.name},
      industry = COALESCE(${input.industry ?? null}, industry),
      location = COALESCE(${input.location ?? null}, location),
      discovery_source = ${input.discoverySource},
      website_research = ${input.websiteResearch ? JSON.stringify(input.websiteResearch) : null}::jsonb,
      ai_detection = ${input.aiDetection ? JSON.stringify(input.aiDetection) : null}::jsonb,
      last_checked_at = NOW()
    WHERE domain = ${input.domain}
    RETURNING company_id
  `;
  const row = updated[0] as { company_id?: string } | undefined;
  if (!row?.company_id) {
    throw new Error(`Company upsert returned no company for domain ${input.domain}`);
  }
  return { companyId: String(row.company_id), created: false };
}

export async function getCompanyByDomain(
  sql: DiscoverySql,
  domain: string,
): Promise<CompanyRecord | null> {
  const rows = await sql`
    SELECT
      company_id, name, domain, industry, location, discovery_source,
      website_research, ai_detection, last_checked_at, created_at
    FROM companies
    WHERE domain = ${domain}
    LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    companyId: String(row.company_id),
    name: String(row.name),
    domain: String(row.domain),
    industry: row.industry == null ? null : String(row.industry),
    location: row.location == null ? null : String(row.location),
    discoverySource: String(row.discovery_source),
    websiteResearch: (row.website_research as WebsiteResearchResult | null) ?? null,
    aiDetection: (row.ai_detection as AiDetectionResult | null) ?? null,
    lastCheckedAt: row.last_checked_at == null ? null : String(row.last_checked_at),
    createdAt: String(row.created_at),
  };
}

/**
 * Freshness check: returns true when a company was researched within
 * `maxAgeMs`. Re-running discovery then skips re-fetching (cache-first).
 */
export async function hasFreshResearch(
  sql: DiscoverySql,
  domain: string,
  maxAgeMs: number,
): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM companies
    WHERE domain = ${domain}
      AND last_checked_at IS NOT NULL
      AND last_checked_at > NOW() - (${maxAgeMs}::bigint || ' milliseconds')::interval
    LIMIT 1
  `;
  return rows.length > 0;
}
