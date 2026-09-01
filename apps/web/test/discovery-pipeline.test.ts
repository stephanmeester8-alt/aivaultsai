import assert from "node:assert/strict";
import { test } from "node:test";

import { runDiscoveryPipeline } from "../lib/prospect-run/discovery-pipeline.ts";
import { inferProspectIntelligence } from "../lib/prospect-run/prospect-agent.ts";
import { scoreProspect } from "../lib/prospect-run/scoring.ts";
import type { DiscoverySql } from "../lib/prospect-run/discovery-repository.ts";
import type { ProspectInput } from "../lib/prospect-run/types.ts";

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

const INTERCOM_PAGE = htmlPage(
  "Acme BV",
  '<script src="https://widget.intercom.io/widget/abc"></script><p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat.</p>',
);
const PLAIN_PAGE = htmlPage(
  "Beta BV",
  "<p>Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat. Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat. Wij leveren kwaliteit sinds 1998. Ons team staat voor u klaar met advies en ondersteuning op maat. Wij leveren kwaliteit sinds 1998.</p>",
);

function makeFakeSql() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  let companySeq = 0;
  let runSeq = 0;
  const sql: DiscoverySql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ sql: text, values });
    if (text.includes("SELECT 1\n    FROM companies")) return [];
    if (text.includes("INSERT INTO companies")) return [{ company_id: `c-${++companySeq}` }];
    if (text.includes("UPDATE companies")) return [];
    if (text.includes("INSERT INTO prospect_runs")) return [{ run_id: `run-${++runSeq}` }];
    if (text.includes("UPDATE prospect_runs")) return [{ run_id: "claimed" }];
    if (text.includes("INSERT INTO audit_manifests")) return [];
    return [];
  };
  return { sql, calls };
}

function pipelineDeps(sql: DiscoverySql, fetchImpl: typeof fetch) {
  return {
    sql,
    fetchImpl,
    lookup: async () => ["93.184.216.34"],
    now: () => "2026-09-01T00:00:00.000Z",
    log: () => {},
  };
}

test("pipeline: discovery -> research -> detection -> existing prospect run", async () => {
  const { sql, calls } = makeFakeSql();
  const summary = await runDiscoveryPipeline(
    {
      companies: [
        { name: "Acme BV", websiteUrl: "https://www.acme.nl", industry: "SaaS" },
        { name: "Beta BV", websiteUrl: "https://beta.nl" },
      ],
      tenantId: "11111111-1111-4111-8111-111111111111",
    },
    pipelineDeps(sql, async (url) => {
      const u = String(url);
      return new Response(u.includes("acme") ? INTERCOM_PAGE : PLAIN_PAGE, { status: 200 });
    }),
  );

  assert.equal(summary.discovered, 2);
  assert.equal(summary.processed, 2);
  assert.equal(summary.rejected.length, 0);

  const acme = summary.outcomes.find((o) => o.domain === "acme.nl")!;
  assert.equal(acme.aiDetection?.status, "yes");
  assert.ok(acme.aiDetection!.detectedTechnologies.includes("Intercom"));
  assert.ok(acme.aiDetection!.evidence.length > 0);
  assert.equal(acme.companyId, "c-1");
  assert.equal(acme.prospect?.runId, "run-1");
  assert.equal(acme.prospect?.state, "BLOCKED"); // HUMAN_REVIEW without verified email

  const beta = summary.outcomes.find((o) => o.domain === "beta.nl")!;
  assert.equal(beta.aiDetection?.status, "no");
  assert.equal(beta.aiDetection?.confidence, 0.6);

  // Idempotency key: discovery:<domain> for every created run.
  const runInsert = calls.find((c) => c.sql.includes("INSERT INTO prospect_runs"))!;
  assert.equal(runInsert.values[1], "discovery:acme.nl");
  assert.ok(calls.some((c) => c.sql.includes("INSERT INTO audit_manifests")));
});

test("pipeline: detection evidence feeds the existing scoring", async () => {
  const { sql } = makeFakeSql();
  const analyzeInputs: ProspectInput[] = [];
  const summary = await runDiscoveryPipeline(
    {
      companies: [{ name: "Acme BV", websiteUrl: "https://acme.nl" }],
      tenantId: "11111111-1111-4111-8111-111111111111",
    },
    {
      ...pipelineDeps(sql, async () => new Response(INTERCOM_PAGE, { status: 200 })),
      analyze: async (input) => {
        analyzeInputs.push(input);
        return inferProspectIntelligence(input);
      },
    },
  );

  assert.equal(summary.processed, 1);
  assert.equal(analyzeInputs.length, 1);
  const input = analyzeInputs[0]!;
  assert.ok(input.publicSignals!.some((s) => s.includes("AI assistant detection: yes")));
  assert.ok(input.publicSignals!.some((s) => s.includes("Intercom")));

  // The existing scoring engine turns the evidence into a positive score.
  const intelligence = inferProspectIntelligence(input);
  const score = scoreProspect(intelligence);
  assert.ok(score.total > 0, `expected positive score, got ${score.total}`);
  assert.ok(score.rationale.length > 0);
});

test("pipeline: duplicate domains are deduplicated before processing", async () => {
  const { sql, calls } = makeFakeSql();
  const summary = await runDiscoveryPipeline(
    {
      companies: [
        { name: "Acme BV", websiteUrl: "https://www.acme.nl" },
        { name: "Acme BV herhaald", websiteUrl: "https://acme.nl" },
      ],
      tenantId: "11111111-1111-4111-8111-111111111111",
    },
    pipelineDeps(sql, async () => new Response(INTERCOM_PAGE, { status: 200 })),
  );
  assert.equal(summary.processed, 1);
  assert.equal(calls.filter((c) => c.sql.includes("INSERT INTO prospect_runs")).length, 1);
});

test("pipeline: fresh companies are skipped (cache-first, idempotent re-run)", async () => {
  const { sql, calls } = makeFakeSql();
  let fetched = 0;
  const summary = await runDiscoveryPipeline(
    {
      companies: [{ name: "Acme BV", websiteUrl: "https://acme.nl" }],
      tenantId: "11111111-1111-4111-8111-111111111111",
      freshnessHours: 24,
    },
    {
      ...pipelineDeps(sql, async () => {
        fetched += 1;
        return new Response(INTERCOM_PAGE, { status: 200 });
      }),
      // Override: report the domain as fresh so research is skipped.
      sql: (async (strings, ...values) => {
        const text = strings.join("?");
        calls.push({ sql: text, values });
        if (text.includes("SELECT 1\n    FROM companies")) return [{ one: 1 }];
        return [];
      }) as DiscoverySql,
    },
  );
  assert.equal(fetched, 0);
  assert.equal(summary.processed, 1);
  assert.equal(summary.outcomes[0]!.cached, true);
});

test("pipeline: fetch failure is non-fatal and recorded per company", async () => {
  const { sql } = makeFakeSql();
  const summary = await runDiscoveryPipeline(
    {
      companies: [{ name: "Acme BV", websiteUrl: "https://acme.nl" }],
      tenantId: "11111111-1111-4111-8111-111111111111",
    },
    pipelineDeps(sql, async () => {
      throw new TypeError("network down");
    }),
  );
  assert.equal(summary.processed, 1);
  const outcome = summary.outcomes[0]!;
  assert.equal(outcome.research.status, "error");
  assert.ok(outcome.research.errors.some((e) => e.includes("FETCH_FAILED")));
  // The company is still recorded with the failed research for audit.
  assert.equal(outcome.companyId, "c-1");
});

test("pipeline: invalid and empty candidates are rejected with reasons", async () => {
  const { sql } = makeFakeSql();
  const summary = await runDiscoveryPipeline(
    {
      companies: [
        { name: "", websiteUrl: "https://empty.nl" },
        { name: "No URL" },
        { name: "Localhost BV", websiteUrl: "http://localhost:3000" },
        { name: "Acme BV", websiteUrl: "https://acme.nl" },
      ],
      tenantId: "11111111-1111-4111-8111-111111111111",
    },
    pipelineDeps(sql, async () => new Response(INTERCOM_PAGE, { status: 200 })),
  );
  assert.equal(summary.rejected.length, 2); // empty name + localhost host
  assert.equal(summary.processed, 2); // "No URL" (error outcome) + Acme
  assert.ok(summary.outcomes.some((o) => o.domain === "acme.nl" && !o.error));
  assert.ok(summary.outcomes.some((o) => o.error === "NO_WEBSITE_URL"));
});
