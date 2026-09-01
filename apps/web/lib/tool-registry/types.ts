/**
 * Agent Tool Platform — ToolSpec (centrale tool-metadata, app-laag).
 *
 * Design: docs/architecture/tool-registry-design.md (TASK 3).
 * De app-laag ToolSpec is RIJKER dan de agent-core ToolDefinition (vrije
 * tool-ids, tenantPolicy, rateLimit, class) en voedt later de bestaande
 * PolicyEngine/ExecutionGate. Fail-closed: onbekende velden/waarden worden
 * bij registratie geweigerd (validation.ts).
 */

export const TOOL_CATEGORIES = [
  "WEB",
  "BROWSER",
  "FILES",
  "CODE",
  "TERMINAL",
  "GITHUB",
  "DATABASE",
  "CRM",
  "EMAIL",
  "CALENDAR",
  "AI",
  "OBSERVABILITY",
  "DEPLOYMENT",
  "MCP",
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export type ToolClass = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL_SIDE_EFFECT";

/** Zelfde contract als agent-core RiskLevel (LOW/MEDIUM/HIGH/CRITICAL). */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Tenant-beleid per tool (FASE 9 / TASK 25):
 * - OFF      tool bestaat niet voor de tenant
 * - ON       spec-default (risk-based approval)
 * - APPROVAL approval ook voor MEDIUM-risico
 * - TENANT   per-tenant override mogelijk (data-laag, TASK 25)
 */
export type TenantPolicy = "OFF" | "ON" | "APPROVAL" | "TENANT";

export interface RateLimit {
  readonly max: number;
  readonly windowMs: number;
}

export interface ToolSpec {
  readonly id: string; // bv. "assistant_website_research" (kleine letters, underscores)
  readonly name: string;
  readonly description: string;
  readonly version: string; // semver, bv. "1.0.0"
  readonly category: ToolCategory;
  readonly inputSchema: Readonly<Record<string, unknown>>; // strict JSON-schema (server-side validatie)
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly permissions: readonly string[]; // bv. ["API_REQUEST"], ["EMAIL_SEND"]
  readonly class: ToolClass;
  readonly riskLevel: RiskLevel;
  readonly requiresApproval: boolean; // afgeleid van risk (HIGH/CRITICAL) of tenant-policy
  readonly enabled: boolean; // fail-closed default: false
  readonly adapter: string | null; // id van de ToolAdapter; null = NOT_IMPLEMENTED
  readonly tenantPolicy: TenantPolicy;
  readonly auditEnabled: boolean; // WRITE/DESTRUCTIVE/EXTERNAL_SIDE_EFFECT: altijd true
  readonly timeoutMs: number; // per-tool harde timeout
  readonly rateLimit: RateLimit | null;
}

export function isToolCategory(value: unknown): value is ToolCategory {
  return typeof value === "string" && (TOOL_CATEGORIES as readonly string[]).includes(value);
}

export function isToolClass(value: unknown): value is ToolClass {
  return (
    value === "READ" ||
    value === "WRITE" ||
    value === "DESTRUCTIVE" ||
    value === "EXTERNAL_SIDE_EFFECT"
  );
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL";
}

export function isTenantPolicy(value: unknown): value is TenantPolicy {
  return value === "OFF" || value === "ON" || value === "APPROVAL" || value === "TENANT";
}
