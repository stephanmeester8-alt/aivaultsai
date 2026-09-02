import { Container } from "@/components/container";

import { CTA, PRICE } from "./assistant-offer-data";

/** Afsluitende CTA — beslissing met zekerheid + disclaimer als microcopy. */
export function AssistantCta() {
  return (
    <section className="border-b border-line py-16 sm:py-24" aria-labelledby="assistant-cta">
      <Container className="max-w-4xl text-center">
        <p className="font-mono text-[11px] tracking-[0.2em] text-gold uppercase">{CTA.eyebrow}</p>
        <h2
          id="assistant-cta"
          className="mt-4 text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl"
        >
          {CTA.title}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-mute sm:text-lg">
          {CTA.lead}
        </p>

        <div className="mt-10 flex flex-col items-center gap-4">
          <a
            href={CTA.href}
            className="inline-flex items-center justify-center rounded-sm bg-ink px-7 py-4 text-base font-medium text-canvas no-underline hover:bg-gold"
          >
            {CTA.label} →
          </a>
          <p className="font-mono text-lg text-gold">
            {PRICE.amount} <span className="text-mute">{PRICE.taxNote}</span>
            <span className="mx-2 text-faint">·</span>
            <span className="text-ink">{PRICE.oneTime}</span>
          </p>
          <p className="max-w-xl text-xs leading-relaxed text-faint">{CTA.micro}</p>
        </div>
      </Container>
    </section>
  );
}
