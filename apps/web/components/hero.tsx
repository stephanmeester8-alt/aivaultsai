import { Container } from "./container";

export function Hero() {
  return (
    <section className="border-b border-line" aria-labelledby="hero-heading">
      <Container className="grid gap-12 py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:py-24">
        <div className="reveal">
          <p className="font-mono text-[11px] tracking-[0.2em] text-gold uppercase">AI Agent Operating System</p>
          <h1 id="hero-heading" className="mt-5 max-w-3xl text-4xl font-medium tracking-tight text-ink sm:text-5xl lg:text-6xl">
            AI agents that work together.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-mute sm:text-lg">
            AIVaultsAI is building an AI agent operating system for real-world work — combining specialized
            agents, controlled execution, evidence, approvals and structured collaboration.
          </p>
          <p className="mt-5 font-mono text-xs tracking-[0.16em] text-faint uppercase">
            Research. Reason. Build. Execute. Verify.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#early-access"
              className="inline-flex items-center justify-center rounded-sm bg-ink px-5 py-3 text-sm font-medium text-canvas no-underline hover:bg-gold"
            >
              Join Early Access
            </a>
            <a
              href="#architecture"
              className="inline-flex items-center justify-center rounded-sm border border-line px-5 py-3 text-sm font-medium text-ink no-underline hover:border-gold/50"
            >
              Explore the Architecture
            </a>
          </div>
        </div>
        <aside className="reveal border border-line bg-panel p-5 sm:p-6" aria-label="System status">
          <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">Current status</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
              <dt className="text-mute">Foundation</dt>
              <dd className="font-mono text-xs tracking-wide text-built uppercase">Built</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
              <dt className="text-mute">Execution</dt>
              <dd className="font-mono text-xs tracking-wide text-developing uppercase">Not live</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-mute">Public platform</dt>
              <dd className="font-mono text-xs tracking-wide text-planned uppercase">Planned</dd>
            </div>
          </dl>
          <p className="mt-5 text-xs leading-relaxed text-faint">
            Contracts, policy, approvals, evidence, and orchestration exist as a typed foundation. Tool
            execution, Browser Use, and Hermes are not production capabilities.
          </p>
        </aside>
      </Container>
    </section>
  );
}
