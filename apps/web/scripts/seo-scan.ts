#!/usr/bin/env node
/**
 * AIVaultsAI SEO Scanner CLI (read-only MVP).
 *
 * Usage:
 *   node scripts/seo-scan.ts [--url https://example.com] [--out reports/seo-report.json]
 *
 * Default target: SEO_TARGET_URL env or SITE_URL from lib/site.ts.
 * The scanner performs HTTP reads only and writes a single local JSON report.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runSeoScan } from "../lib/seo/run-scan.ts";
import { buildTextReport } from "../lib/seo/report.ts";
import { SITE_URL } from "../lib/site.ts";

function printHelp(): void {
  console.log(`AIVaultsAI SEO Scanner (read-only)
Usage: node scripts/seo-scan.ts [options]
Options:
  --url <url>     Target URL (default: SEO_TARGET_URL or SITE_URL)
  --out <path>    JSON report output path (default: reports/seo-report.json)
  -h, --help      Show this help`);
}

function parseArgs(argv: string[]): { url: string | null; out: string | null } {
  let url: string | null = null;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--url" || arg === "-u") {
      url = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--out" || arg === "-o") {
      out = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      url = arg;
    }
  }
  return { url, out };
}

async function main(): Promise<void> {
  const { url, out } = parseArgs(process.argv.slice(2));
  const target = url ?? process.env.SEO_TARGET_URL ?? SITE_URL;
  const outPath = out ?? "reports/seo-report.json";

  console.log("AIVaultsAI SEO Scanner (read-only)");
  console.log(`Target: ${target}`);
  console.log("");

  const report = await runSeoScan({ url: target });

  const absolute = resolve(process.cwd(), outPath);
  await mkdir(resolve(absolute, ".."), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`JSON report written to: ${absolute}`);
  console.log("");

  process.stdout.write(buildTextReport(report));

  if (report.scan.status === "FAILED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    "SEO scan failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
