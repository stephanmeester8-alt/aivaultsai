import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

import { ONBOARDING } from "./assistant-offer-data";

/** Persoonlijke onboarding — één uur, online of indien praktisch op locatie. */
export function AssistantOnboarding() {
  return (
    <section className="border-b border-line py-16 sm:py-20" aria-labelledby="assistant-onboarding">
      <Container className="max-w-5xl">
        <SectionHeading
          id="assistant-onboarding"
          index="04"
          eyebrow={ONBOARDING.eyebrow}
          title={ONBOARDING.title}
        >
          {ONBOARDING.lead}
        </SectionHeading>

        <ul className="mt-8 space-y-3 text-sm leading-relaxed text-mute sm:text-base">
          {ONBOARDING.points.map((point) => (
            <li key={point} className="flex gap-3">
              <span className="text-gold" aria-hidden="true">
                ✓
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-3xl border-l-2 border-gold/60 pl-4 text-base leading-relaxed text-ink">
          {ONBOARDING.how}
        </p>
      </Container>
    </section>
  );
}
