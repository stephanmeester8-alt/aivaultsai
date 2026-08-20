/**
 * Human-readable and versioned JSON report builders (MVP).
 */

import type { Finding, SeoReport, Severity } from "./types.ts";

export const REPORT_VERSION = "1.0.0";

const SEVERITIES: readonly Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function severityGroup(report: SeoReport, severity: Severity): Finding[] {
  return report.findings.filter((f) => f.severity === severity);
}

export function buildTextReport(report: SeoReport): string {
  const lines: string[] = [];
  lines.push("=".repeat(44));
  lines.push("AIVaultsAI SEO SCAN");
  lines.push("=".repeat(44));
  lines.push("");
  lines.push("Target:");
  lines.push(report.target);
  lines.push("");
  lines.push(`Scan: ${report.scan.startedAt} -> ${report.scan.completedAt}`);
  lines.push(`Status: ${report.scan.status}`);
  lines.push("");
  lines.push(`URLs discovered: ${report.scan.urlsDiscovered}`);
  lines.push(`URLs scanned: ${report.scan.urlsScanned}`);
  lines.push(`Page failures: ${report.scan.pageFailures}`);
  lines.push(
    `Coverage: ${report.coverage.overall}% (confidence: ${report.coverage.confidence})`,
  );
  lines.push("");
  lines.push("-".repeat(44));
  lines.push("SEO HEALTH");
  lines.push("-".repeat(44));
  for (const metric of report.metrics) {
    lines.push(
      `${metric.dimension.padEnd(20)} ${String(metric.score).padStart(3)}/100  (coverage ${metric.coverage}%, ${metric.confidence})`,
    );
  }
  lines.push("");
  lines.push(`Overall: ${report.overall.score}/100`);
  lines.push(`Coverage: ${report.overall.coverage}%`);
  lines.push(`Confidence: ${report.overall.confidence}`);
  lines.push("");
  lines.push("-".repeat(44));
  lines.push("FINDINGS");
  lines.push("-".repeat(44));
  for (const severity of SEVERITIES) {
    const group = severityGroup(report, severity);
    if (group.length === 0) continue;
    lines.push(severity);
    group.forEach((f, index) => {
      const location = f.url === null ? "" : ` (${f.url})`;
      lines.push(
        `${index + 1}. [${f.type}] ${f.claim}${location} — ${f.confidence}/${f.epistemicType}`,
      );
    });
    lines.push("");
  }
  lines.push("-".repeat(44));
  lines.push("PROPOSALS");
  lines.push("-".repeat(44));
  if (report.proposals.length === 0) {
    lines.push("(none)");
  } else {
    report.proposals.forEach((proposal, index) => {
      lines.push(`${index + 1}. [${proposal.severity}] ${proposal.issue}`);
      lines.push(`   Change: ${proposal.recommendedChange}`);
      lines.push(`   Benefit: ${proposal.expectedBenefit}`);
      lines.push(`   Risk: ${proposal.risk}`);
      lines.push(`   Validation: ${proposal.validationMethod}`);
    });
  }
  lines.push("");
  lines.push("-".repeat(44));
  lines.push("SAFETY");
  lines.push("-".repeat(44));
  lines.push(`Read-only: ${report.safety.readOnly}`);
  lines.push(`Writes performed: ${report.safety.writesPerformed}`);
  lines.push("=".repeat(44));
  return `${lines.join("\n")}\n`;
}

/** The JSON report is already versioned; this helper documents the schema version. */
export function toJsonReport(report: SeoReport): SeoReport {
  return report;
}
