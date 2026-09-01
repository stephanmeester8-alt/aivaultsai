/**
 * Prospect discovery abstraction (TASK: Prospect Discovery + AI Detection).
 *
 * Providers are swappable: a provider only produces raw company candidates.
 * Normalization, domain extraction, validation and deduplication happen here,
 * so no provider can inject duplicate or invalid identities. No search engine
 * or external vendor is hardcoded as an architectural dependency.
 */

import { validateUrl } from "../seo/url-policy.ts";

export interface DiscoveredCompany {
  name: string;
  websiteUrl?: string;
  industry?: string;
  location?: string;
}

export interface ProspectDiscoveryProvider {
  /** Stable identifier recorded as discovery_source on companies. */
  readonly source: string;
  discover(): Promise<DiscoveredCompany[]>;
}

/** Seed-list provider: explicit, auditable, no external dependency. */
export class StaticListDiscoveryProvider implements ProspectDiscoveryProvider {
  readonly source = "manual_list";
  #companies: readonly DiscoveredCompany[];

  constructor(companies: readonly DiscoveredCompany[]) {
    this.#companies = companies;
  }

  async discover(): Promise<DiscoveredCompany[]> {
    return [...this.#companies];
  }
}

/** Normalize a company name: trim, collapse whitespace, strip stray quotes. */
export function normalizeCompanyName(name: string): string {
  return name
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reject hostnames that are IP literals or localhost — never company domains. */
export function isUsableHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost") return false;
  if (lower.endsWith(".localhost")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return false;
  if (lower.includes(":")) return false; // IPv6 literal
  return true;
}

/** Extract a normalized public domain from a website URL, or null. */
export function extractDomain(websiteUrl: string | undefined): string | null {
  if (!websiteUrl) return null;
  const validation = validateUrl(websiteUrl);
  if (!validation.ok) return null;
  const hostname = validation.url.hostname.toLowerCase();
  if (!isUsableHostname(hostname)) return null;
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Public-domain shape check (no IPs, no localhost, at least one dot). */
export function isValidPublicDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  return isUsableHostname(lower) && DOMAIN_RE.test(lower);
}

/** Deduplicate candidates by normalized domain first, then by name. */
export function dedupeCompanies(
  companies: readonly DiscoveredCompany[],
): DiscoveredCompany[] {
  const byDomain = new Map<string, DiscoveredCompany>();
  const byName = new Map<string, DiscoveredCompany>();

  for (const company of companies) {
    const domain = extractDomain(company.websiteUrl);
    if (domain) {
      if (!byDomain.has(domain)) byDomain.set(domain, company);
      continue;
    }
    const name = normalizeCompanyName(company.name).toLowerCase();
    if (name && !byName.has(name)) byName.set(name, company);
  }
  return [...byDomain.values(), ...byName.values()];
}

/** Split candidates into usable entries and rejected ones (with reasons). */
export function validateCompanies(
  companies: readonly DiscoveredCompany[],
): { valid: DiscoveredCompany[]; rejected: Array<{ company: DiscoveredCompany; reason: string }> } {
  const valid: DiscoveredCompany[] = [];
  const rejected: Array<{ company: DiscoveredCompany; reason: string }> = [];

  for (const company of companies) {
    if (!normalizeCompanyName(company.name)) {
      rejected.push({ company, reason: "EMPTY_COMPANY_NAME" });
      continue;
    }
    if (company.websiteUrl) {
      const validation = validateUrl(company.websiteUrl);
      if (!validation.ok) {
        rejected.push({ company, reason: `INVALID_URL: ${validation.reason}` });
        continue;
      }
      if (!isUsableHostname(validation.url.hostname)) {
        rejected.push({ company, reason: "NON_PUBLIC_HOST" });
        continue;
      }
      if (!extractDomain(company.websiteUrl)) {
        rejected.push({ company, reason: "INVALID_DOMAIN" });
        continue;
      }
    }
    valid.push({
      name: normalizeCompanyName(company.name),
      websiteUrl: company.websiteUrl,
      industry: company.industry?.trim() || undefined,
      location: company.location?.trim() || undefined,
    });
  }
  return { valid, rejected };
}
