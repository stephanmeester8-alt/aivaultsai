import Link from "next/link";

import { Container } from "@/components/container";

import { HERO, PRICE } from "./assistant-offer-data";

/** Hero — belofte, drie onderdelen, duidelijke prijs. */
export function AssistantHero() {
  return (
    <section className="border-b border-line" aria-labelledby="assistant-hero">
      <Container className="py-16 sm:py-24 lg:py-28">
        <p className="font-mono text-[11px] tracking-[0.2em] text-gold uppercase">{HERO.eyebrow}</p>
        <h1
          id="assistant-hero"
          className="mt-6 max-w-5xl text-4xl font-medium leading-tight tracking-tight text-ink sm:text-5xl lg:text-6xl"
        >
          {HERO.title}
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-mute sm:text-xl">{HERO.lead}</p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={HERO.ctaHref}
            className="inline-flex items-center justify-center rounded-sm bg-ink px-5 py-3 text-sm font-medium text-canvas no-underline hover:bg-gold"
          >
            {HERO.ctaLabel} →
          </Link>
          <Link
            href={HERO.secondaryHref}
            className="inline-flex items-center justify-center rounded-sm border border-line px-5 py-3 text-sm font-medium text-ink no-underline hover:border-gold/60"
          >
            {HERO.secondaryLabel}
          </Link>
        </div>

        <p className="mt-8 font-mono text-xl text-gold sm:text-2xl">
          {PRICE.amount} <span className="text-mute">{PRICE.taxNote}</span>
          <span className="mx-2 text-faint">·</span>
          <span className="text-ink">{PRICE.oneTime}</span>
        </p>
        <p className="mt-3 max-w-xl text-xs leading-relaxed text-faint">{HERO.micro}</p>
      </Container>
    </section>
  );
}
