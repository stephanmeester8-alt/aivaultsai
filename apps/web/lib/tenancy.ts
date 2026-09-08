/**
 * Tenancy — centrale tenant-resolutie (Sprint 3).
 *
 * Architectuurregel:
 *   Authentication → Tenant Resolution → Tenant Context → Skills/Repos/Tools → Data
 * Tenant wordt NOOIT achteraf toegevoegd; context is vóór elke business
 * execution bekend (NO TENANT = NO EXECUTION, assertTenantContext).
 *
 * Canonical tenant-entiteit: `prospect_tenants` (migratie 003) — de
 * bestaande tabel is in de hele codebase al de tenant-referentie
 * (employee-sessies, email_drafts, tool_call_records, policies, runs)
 * en heeft FK-ketens. Eén tenant-entiteit i.p.v. een tweede systeem.
 *
 * Huidige site = single-tenant (AIVaultsAI zelf). Eén centrale
 * site-tenant-resolutie; later vervangbaar door authenticated resolution.
 */

import { TenantContextRequiredError } from "./skills/types.ts";

/**
 * Default tenant van de huidige AIVaultsAI-site. Vaste UUID zodat backfill
 * en seed deterministisch zijn (zelfde waarde als de test-tenants).
 */
export const DEFAULT_TENANT_ID = "11111111-1111-4111-8111-111111111111";

/**
 * Site-tenant voor de publieke website (assistant/leads/booking zonder
 * inlog). Eén centrale plek — geen verspreide "tenantId ?? default".
 * Overschrijfbaar via TENANT_ID (server-env) voor toekomstige omgevingen.
 */
export function getSiteTenantId(): string {
  const configured = process.env.TENANT_ID;
  return typeof configured === "string" && configured.trim().length > 0
    ? configured.trim()
    : DEFAULT_TENANT_ID;
}

/** Fail-closed: retourneert tenantId of gooit de centrale invariant. */
export function requireTenantId(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TenantContextRequiredError();
  }
  return value.trim();
}
