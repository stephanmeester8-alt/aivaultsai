/**
 * Pure URL and IP policy for the read-only SEO scanner.
 *
 * Purpose: the scanner must never become a generic SSRF tool.
 * Only http/https, never private/link-local/loopback addresses,
 * same-origin scope by default.
 */

export const BLOCKED_SCHEMES = [
  "file:",
  "ftp:",
  "javascript:",
  "data:",
  "chrome:",
  "about:",
  "ws:",
  "wss:",
] as const;

export type UrlValidation =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/** Validate scheme and basic shape. Pure; no DNS. */
export function validateUrl(raw: string): UrlValidation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Blocked scheme: ${url.protocol}` };
  }
  if (!url.hostname) {
    return { ok: false, reason: "Missing host" };
  }
  return { ok: true, url };
}

/** Extract the bare hostname (strips IPv6 brackets). */
export function bareHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

export function isLocalhostName(host: string): boolean {
  return host.toLowerCase() === "localhost";
}

export function sameOrigin(a: URL, b: URL): boolean {
  return a.origin === b.origin;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/**
 * Private / loopback / link-local / metadata / CGNAT IPv4 ranges.
 * Pure function over a string; no DNS involved.
 */
export function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return false;
  const a = value >>> 24;
  const b = (value >>> 16) & 0xff;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  return false;
}

function expandIpv6(ip: string): string[] | null {
  if (ip.indexOf("::") !== -1 && ip.split("::").length > 2) return null;
  const doubleColon = ip.indexOf("::");
  const head = doubleColon === -1 ? ip : ip.slice(0, doubleColon);
  const tail = doubleColon === -1 ? "" : ip.slice(doubleColon + 2);
  const headParts = head === "" ? [] : head.split(":");
  const tailParts = tail === "" ? [] : tail.split(":");
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0) return null;
  const groups = [...headParts, ...Array<string>(missing).fill("0"), ...tailParts];
  if (groups.length !== 8) return null;
  const normalized = groups.map((g) => g.padStart(4, "0"));
  if (normalized.some((g) => !/^[0-9a-f]{4}$/.test(g))) return null;
  return normalized;
}

/**
 * Private IPv6 ranges: ::1 (loopback), fc00::/7 (ULA), fe80::/10
 * (link-local) and IPv4-mapped ::ffff:a.b.c.d (checked as IPv4).
 *
 * Prefix checks compare the first 16 bits against the prefix mask:
 *   fc00::/7  -> first 7 bits 1111110 -> mask 0xfe00
 *   fe80::/10 -> first 10 bits 1111111010 -> mask 0xffc0
 */
export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  const groups = expandIpv6(lower);
  if (!groups) return false;
  const firstGroup = parseInt(groups[0]!, 16);
  if ((firstGroup & 0xfe00) === 0xfc00) return true;
  if ((firstGroup & 0xffc0) === 0xfe80) return true;
  return false;
}

/** Accepts both IPv4 and IPv6 strings. */
export function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) return isPrivateIpv6(ip);
  return isPrivateIpv4(ip);
}

/** Resolve + policy check for a host: any private address blocks it. */
export function isHostBlocked(host: string, addresses: readonly string[]): boolean {
  if (isLocalhostName(host)) return true;
  return addresses.some((address) => isPrivateIp(address));
}
