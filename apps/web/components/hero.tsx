import { Container } from "./container";

export function Hero() {
  return (
    <section className="border-b border-line" aria-labelledby="hero-heading">
      <Container className="grid gap-12 py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:py-24">
        <div className="reveal">
          <p className="font-mono text-[11px] tracking-[0.2em] text-gold uppercase">AI automation for real businesses</p>
          <h1 id="hero-heading" className="mt-5 max-w-3xl text-4xl font-medium tracking-tight text-ink sm:text-5xl lg:text-6xl">
            AI die werk uit handen neemt.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-mute sm:text-lg">
            AIVaultsAI helpt Nederlandse MKB-bedrijven repetitief werk automatiseren — van klantaanvragen en e-mail tot documenten, leads en opvolging.
          </p>
          <p className="mt-5 max-w-xl font-mono text-xs leading-relaxed tracking-[0.12em] text-faint uppercase">
            Start klein. Automatiseer één proces. Zie resultaat.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="#pricing"
              className="inline-flex items-center justify-center rounded-sm bg-ink px-5 py-3 text-sm font-medium text-canvas no-underline hover:bg-gold"
            >
              Bekijk het aanbod
            </a>
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-sm border border-line px-5 py-3 text-sm font-medium text-ink no-underline hover:border-gold/50"
            >
              Bespreek jouw proces
            </a>
          </div>
        </div>
        <aside className="reveal border border-line bg-panel p-5 sm:p-6" aria-label="AIVaultsAI approach">
          <p className="font-mono text-[11px] tracking-[0.16em] text-faint uppercase">Zo werken we</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
              <dt className="text-mute">1. Proces</dt>
              <dd className="font-mono text-xs tracking-wide text-ink uppercase">Analyse</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
              <dt className="text-mute">2. Automatisering</dt>
              <dd className="font-mono text-xs tracking-wide text-ink uppercase">Bouwen</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-mute">3. Resultaat</dt>
              <dd className="font-mono text-xs tracking-wide text-built uppercase">Opleveren</dd>
            </div>
          </dl>
          <p className="mt-5 text-xs leading-relaxed text-faint">
            Geen maandenlang IT-project. We beginnen met één concreet proces en bouwen van daaruit verder.
          </p>
        </aside>
      </Container>
    </section>
  );
}
