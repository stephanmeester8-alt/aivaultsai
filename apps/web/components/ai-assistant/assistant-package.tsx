import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

import { DISCLAIMER, PACKAGE, PRICE } from "./assistant-offer-data";

/** Wat je krijgt voor €249 — drie onderdelen + prijsband + disclaimer. */
export function AssistantPackage() {
  return (
    <section
      id="pakket"
      className="border-b border-line py-16 sm:py-20"
      aria-labelledby="assistant-package"
    >
      <Container>
        <SectionHeading id="assistant-package" index="02" eyebrow={PACKAGE.eyebrow} title={PACKAGE.title}>
          {PACKAGE.lead}
        </SectionHeading>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PACKAGE.items.map((item) => (
            <article key={item.title} className="flex flex-col border border-line bg-panel p-6">
              <h3 className="text-lg font-medium text-ink">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-mute">{item.detail}</p>
            </article>
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-mute">{PACKAGE.onboardingNote}</p>

        <div className="mt-10 flex flex-col gap-4 border border-gold/40 bg-panel p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-2xl text-gold">
              {PRICE.amount} <span className="text-mute">{PRICE.taxNote}</span>
            </p>
            <p className="mt-1 text-sm text-mute">
              {PRICE.oneTime} · alles inbegrepen · geen abonnement
            </p>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-mute">
            Bestellen doe je via de knop onderaan deze pagina.
          </p>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-faint">{DISCLAIMER}</p>
      </Container>
    </section>
  );
}
