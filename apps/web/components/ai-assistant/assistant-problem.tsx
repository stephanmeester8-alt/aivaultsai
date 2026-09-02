import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

import { PROBLEM } from "./assistant-offer-data";

/** Het probleem — herkenning zonder overdrijving. */
export function AssistantProblem() {
  return (
    <section className="border-b border-line py-16 sm:py-20" aria-labelledby="assistant-problem">
      <Container>
        <SectionHeading id="assistant-problem" index="01" eyebrow={PROBLEM.eyebrow} title={PROBLEM.title}>
          {PROBLEM.lead}
        </SectionHeading>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PROBLEM.cards.map((card) => (
            <article key={card.title} className="border border-line bg-panel p-5">
              <h3 className="text-base font-medium text-ink">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{card.detail}</p>
            </article>
          ))}
        </div>
        <p className="mt-10 max-w-3xl text-base leading-relaxed text-ink sm:text-lg">{PROBLEM.bridge}</p>
      </Container>
    </section>
  );
}
