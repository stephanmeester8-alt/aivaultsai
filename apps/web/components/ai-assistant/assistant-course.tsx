import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

import { COURSE } from "./assistant-offer-data";

/** De cursus — acht hoofdstukken met concreet resultaat per hoofdstuk. */
export function AssistantCourse() {
  return (
    <section className="border-b border-line py-16 sm:py-20" aria-labelledby="assistant-course">
      <Container>
        <SectionHeading id="assistant-course" index="03" eyebrow={COURSE.eyebrow} title={COURSE.title}>
          {COURSE.lead}
        </SectionHeading>

        <ol className="mt-10 grid gap-5 md:grid-cols-2">
          {COURSE.chapters.map((chapter) => (
            <li key={chapter.number} className="border border-line bg-panel p-6">
              <p className="font-mono text-[10px] tracking-[0.18em] text-gold uppercase">
                Hoofdstuk {chapter.number}
              </p>
              <h3 className="mt-2 text-lg font-medium text-ink">{chapter.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">Je leert: {chapter.learn}</p>
              <p className="mt-3 text-sm leading-relaxed text-gold">
                Resultaat: {chapter.result}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
