import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

import { FAQ } from "./assistant-offer-data";

/** FAQ — native <details>-patronen, geen client-JS nodig (toegankelijk). */
export function AssistantFaq() {
  return (
    <section className="border-b border-line py-16 sm:py-20" aria-labelledby="assistant-faq">
      <Container className="max-w-4xl">
        <SectionHeading id="assistant-faq" index="07" eyebrow={FAQ.eyebrow} title={FAQ.title} />
        <div className="mt-8 border-t border-line">
          {FAQ.items.map((item) => (
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
  );
}
