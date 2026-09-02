import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

import { PRICE, VALUE } from "./assistant-offer-data";

/** Waarde — één prijs, eerlijke inclusief-lijst, voorzichtige ROI-redenering. */
export function AssistantValue() {
  return (
    <section className="border-b border-line py-16 sm:py-20" aria-labelledby="assistant-value">
      <Container className="max-w-5xl">
        <SectionHeading id="assistant-value" index="06" eyebrow={VALUE.eyebrow} title={VALUE.title}>
          {PRICE.amount} {PRICE.taxNote}, {PRICE.oneTime} — geen maandelijkse kosten.
        </SectionHeading>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="border border-line bg-panel p-6">
            <h3 className="text-base font-medium text-ink">Inclusief</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-mute">
              {VALUE.includes.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="text-gold" aria-hidden="true">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-line bg-panel p-6">
            <h3 className="text-base font-medium text-ink">{VALUE.rationaleTitle}</h3>
            <p className="mt-4 text-sm leading-relaxed text-mute">{VALUE.rationale}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
