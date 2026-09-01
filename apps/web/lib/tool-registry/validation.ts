/**
 * Agent Tool Platform — ToolSpec-validatie (fail-closed).
 *
 * Elke ToolSpec moet volledig geldig zijn VOORDAT hij geregistreerd wordt:
 * een ongeldige spec wordt geweigerd (throw) — nooit stilzwijgend hersteld.
 */

import {
  isRiskLevel,
  isTenantPolicy,
  isToolCategory,
  isToolClass,
  type ToolSpec,
} from "./types.ts";

const TOOL_ID_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function fail(reason: string): never {
  throw new Error(`INVALID_TOOL_SPEC: ${reason}`);
}

function assertNonEmptyString(value: unknown, field: string, maxLength: number): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    fail(`${field} exceeds ${maxLength} characters`);
  }
}

/** Gooit bij de eerste ongeldigheid; retourneert de spec bij succes. */
export function assertValidToolSpec(spec: ToolSpec): ToolSpec {
  if (spec === null || typeof spec !== "object") {
    fail("spec must be an object");
  }

  if (typeof spec.id !== "string" || !TOOL_ID_PATTERN.test(spec.id)) {
    fail(`id must match ${TOOL_ID_PATTERN} (got ${String(spec.id)})`);
  }
  assertNonEmptyString(spec.name, "name", 100);
  assertNonEmptyString(spec.description, "description", 500);
  if (typeof spec.version !== "string" || !SEMVER_PATTERN.test(spec.version)) {
    fail(`version must be semver (got ${String(spec.version)})`);
  }
  if (!isToolCategory(spec.category)) {
    fail(`unknown category: ${String(spec.category)}`);
  }
  if (spec.inputSchema === null || typeof spec.inputSchema !== "object" || Array.isArray(spec.inputSchema)) {
    fail("inputSchema must be an object (JSON-schema)");
  }
  if (spec.outputSchema === null || typeof spec.outputSchema !== "object" || Array.isArray(spec.outputSchema)) {
    fail("outputSchema must be an object (JSON-schema)");
  }
  if (!Array.isArray(spec.permissions) || spec.permissions.length === 0) {
    fail("permissions must be a non-empty array");
  }
  for (const permission of spec.permissions) {
    if (typeof permission !== "string" || permission.trim().length === 0) {
      fail("permissions must contain only non-empty strings");
    }
  }
  if (!isToolClass(spec.class)) {
    fail(`unknown class: ${String(spec.class)}`);
  }
  if (!isRiskLevel(spec.riskLevel)) {
    fail(`unknown riskLevel: ${String(spec.riskLevel)}`);
  }
  if (typeof spec.requiresApproval !== "boolean") {
    fail("requiresApproval must be a boolean");
  }
  if (typeof spec.enabled !== "boolean") {
    fail("enabled must be a boolean");
  }
  if (spec.adapter !== null && typeof spec.adapter !== "string") {
    fail("adapter must be a string or null");
  }
  if (!isTenantPolicy(spec.tenantPolicy)) {
    fail(`unknown tenantPolicy: ${String(spec.tenantPolicy)}`);
  }
  if (typeof spec.auditEnabled !== "boolean") {
    fail("auditEnabled must be a boolean");
  }
  // Audit is verplicht voor schrijvende tools (FASE 11).
  if (spec.class !== "READ" && spec.auditEnabled !== true) {
    fail("auditEnabled must be true for non-READ tools");
  }
  if (!Number.isInteger(spec.timeoutMs) || spec.timeoutMs <= 0) {
    fail("timeoutMs must be a positive integer");
  }
  if (spec.rateLimit !== null) {
    const rate = spec.rateLimit;
    if (rate === null || typeof rate !== "object") {
      fail("rateLimit must be an object or null");
    }
    if (!Number.isInteger(rate.max) || rate.max <= 0) {
      fail("rateLimit.max must be a positive integer");
    }
    if (!Number.isInteger(rate.windowMs) || rate.windowMs <= 0) {
      fail("rateLimit.windowMs must be a positive integer");
    }
  }
  if (spec.keywords !== undefined) {
    if (!Array.isArray(spec.keywords) || spec.keywords.length > 20) {
      fail("keywords must be an array of at most 20 entries");
    }
    for (const keyword of spec.keywords) {
      if (typeof keyword !== "string" || keyword.trim().length === 0 || keyword.length > 40) {
        fail("keywords must contain only non-empty strings of at most 40 characters");
      }
    }
  }

  return spec;
}
