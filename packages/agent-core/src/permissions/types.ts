export const PERMISSIONS = [
  "WEB_SEARCH",
  "WEB_READ",
  "WEB_NAVIGATE",
  "WEB_CLICK",
  "WEB_TYPE",
  "WEB_DOWNLOAD",
  "WEB_UPLOAD",
  "FILESYSTEM_READ",
  "FILESYSTEM_WRITE",
  "TERMINAL_EXECUTE",
  "API_REQUEST",
  "MCP_EXECUTE",
  "EMAIL_DRAFT",
  "EMAIL_SEND",
  "CRM_READ",
  "CRM_WRITE",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type PermissionDecision = {
  readonly allowed: boolean;
  readonly permission: Permission;
  readonly reason: string;
};

export function isValidPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}
