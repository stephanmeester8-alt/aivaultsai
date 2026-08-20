/**
 * Minimal robots.txt parser (RFC 9309-style syntax).
 * MVP simplification: a single "*" group is used for enforcement;
 * allow-rules are checked after disallow-rules (longest-match and
 * crawl-delay semantics are out of scope).
 */

import type { RobotsRule } from "./types.ts";

export interface RobotsParseResult {
  sitemaps: string[];
  rules: RobotsRule[];
}

export function parseRobots(text: string): RobotsParseResult {
  const sitemaps: string[] = [];
  const rules: RobotsRule[] = [];
  let current: RobotsRule | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (value === "") continue;

    if (key === "user-agent") {
      current = { userAgent: value.toLowerCase(), allow: [], disallow: [] };
      rules.push(current);
    } else if (key === "sitemap") {
      sitemaps.push(value);
    } else if (current !== null) {
      if (key === "allow") current.allow.push(value);
      else if (key === "disallow") current.disallow.push(value);
    }
  }

  return { sitemaps, rules };
}

/** Whether a path is disallowed by the first "*" group (fallback: first group). */
export function isDisallowed(rules: readonly RobotsRule[], path: string): boolean {
  const group = rules.find((rule) => rule.userAgent === "*") ?? rules[0];
  if (!group) return false;

  for (const pattern of group.disallow) {
    if (pattern !== "" && path.startsWith(pattern)) return true;
  }
  for (const pattern of group.allow) {
    if (pattern !== "" && path.startsWith(pattern)) return false;
  }
  return false;
}
