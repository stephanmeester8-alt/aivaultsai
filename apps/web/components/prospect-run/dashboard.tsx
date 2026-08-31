import type { ProspectRunResult } from "@/lib/prospect-run/types";

export function ProspectRunDashboard({ runs }: { runs: readonly ProspectRunResult[] }) {
  return (
    <section className="border border-line bg-panel p-6" aria-labelledby="prospect-run-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-gold uppercase">Prospect-run / controlled workspace</p>
          <h2 id="prospect-run-heading" className="mt-2 text-2xl font-medium text-ink">B2B opportunity pipeline</h2>
        </div>
        <div className="flex gap-2 text-xs"><button type="button" disabled className="border border-line px-3 py-2 text-faint">Run all (admin API)</button><button type="button" disabled className="border border-line px-3 py-2 text-faint">Monitor</button></div>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {runs.map((run) => <article key={run.runId} className="border border-line p-4">
          <p className="font-mono text-xs text-gold">{run.score?.total ?? "—"}/100</p>
          <p className="mt-2 text-sm font-medium text-ink">{run.route ?? "Awaiting route match"}</p>
          <p className="mt-2 text-xs text-mute">State: {run.state}</p>
          {run.score ? <p className="mt-2 text-xs text-faint">{run.score.rationale}</p> : null}
          {run.blockedReason ? <p className="mt-2 text-xs text-gold">Blocked: {run.blockedReason}</p> : null}
        </article>)}
      </div>
    </section>
  );
}
