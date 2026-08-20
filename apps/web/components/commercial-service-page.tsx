import Link from "next/link";

import type { ServicePageConfig } from "@/lib/service-pages";

import { Container } from "./container";
import { LiveAssistant } from "./live-assistant";
import { JsonLd } from "./seo/json-ld";

/**
 * Shared server component for the three commercial landing pages
 * (TASK 16). Answer-first structure: direct statement, definition,
 * capabilities, audience, how it works, FAQ, related services and a
 * live assistant entry point.
 */
export function CommercialServicePage({
  config,
  schema,
}: {
  config: ServicePageConfig;
  schema: object;
}) {
  return (
    <>
      <JsonLd data={schema} />

      {/* Hero */}
      <section className="border-b border-line" aria-labelledby="service-hero">
        <Container className="py-16 sm:py-24">
          <p className="font-mono text-[11px] tracking-[0.2em] text-gold uppercase">
            {config.serviceName} · AIVaultsAI
          </p>
          <h1
            id="service-hero"
            className="mt-5 max-w-4xl text-4xl font-medium tracking-tight text-ink sm:text-5xl lg:text-6xl"
          >
            {config.h1}
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-relaxed text-mute sm:text-xl">
            {config.hero}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href={config.primaryCta.href}
              className="inline-flex items-center justify-center rounded-sm bg-ink px-4 py-3 text-sm font-medium text-canvas no-underline hover:bg-gold"
            >
              {config.primaryCta.label} →
            </a>
            <a
              href={config.secondaryCta.href}
              className="inline-flex items-center justify-center rounded-sm border border-line px-4 py-3 text-sm font-medium text-ink no-underline hover:border-gold/60"
            >
              {config.secondaryCta.label}
            </a>
          </div>
        </Container>
      </section>

      {/* Direct answer / definition */}
      <section className="border-b border-line py-16 sm:py-20" aria-labelledby="service-definition">
        <Container>
          <p className="font-mono text-[10px] tracking-[0.18em] text-gold uppercase">
            Kort gezegd
          </p>
          <p
            id="service-definition"
            className="mt-4 max-w-3xl text-xl leading-relaxed text-ink sm:text-2xl"
          >
            {config.definition}
          </p>
        </Container>
      </section>

      {/* Capabilities */}
      <section className="border-b border-line py-16 sm:py-20" aria-labelledby="service-capabilities">
        <Container>
          <h2 id="service-capabilities" className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            Wat het doet
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {config.capabilities.map((capability) => (
              <article key={capability.title} className="border border-line bg-panel p-5">
                <h3 className="text-base font-medium text-ink">{capability.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">{capability.detail}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* Audience */}
      <section className="border-b border-line py-16 sm:py-20" aria-labelledby="service-audience">
        <Container>
          <h2 id="service-audience" className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            Voor wie is dit?
          </h2>
          <ul className="mt-6 space-y-3 text-sm leading-relaxed text-mute">
            {config.audience.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="text-gold">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* How it works */}
      <section className="border-b border-line py-16 sm:py-20" aria-labelledby="service-how">
        <Container>
          <h2 id="service-how" className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            Hoe het werkt
          </h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {config.howItWorks.map((step, index) => (
              <li key={step} className="border border-line bg-panel p-5">
                <p className="font-mono text-[10px] tracking-[0.18em] text-gold uppercase">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-mute">{step}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* FAQ */}
      <section className="border-b border-line py-16 sm:py-20" aria-labelledby="service-faq">
        <Container className="max-w-4xl">
          <h2 id="service-faq" className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            Veelgestelde vragen
          </h2>
          <div className="mt-8 border-t border-line">
            {config.faq.map((item) => (
              <details key={item.question} className="border-b border-line py-5">
                <summary className="cursor-pointer text-base font-medium text-ink">
                  {item.question}
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mute">{item.answer}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      {/* Related services */}
      <section className="border-b border-line py-16 sm:py-20" aria-labelledby="service-related">
        <Container>
          <h2 id="service-related" className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            Meer diensten
          </h2>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {config.related.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border border-line bg-panel px-5 py-3 text-sm font-medium text-ink no-underline hover:border-gold/60"
              >
                {link.label} →
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* Assistant entry point */}
      <LiveAssistant />
    </>
  );
}
