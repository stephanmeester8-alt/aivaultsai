import { Container } from "@/components/container";
import { SectionHeading } from "@/components/section-heading";

import { COMPARISON } from "./assistant-offer-data";

/** Vergelijking — alleen een tool vs. het complete pakket. */
export function AssistantComparison() {
  return (
    <section className="border-b border-line py-16 sm:py-20" aria-labelledby="assistant-comparison">
      <Container>
        <SectionHeading
          id="assistant-comparison"
          index="05"
          eyebrow={COMPARISON.eyebrow}
          title={COMPARISON.title}
        />

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {COMPARISON.columns.map((column) => {
            const highlighted = "highlight" in column && column.highlight === true;
            return (
              <article
                key={column.title}
                className={
                  highlighted
                    ? "border border-gold/40 bg-panel p-6"
                    : "border border-line bg-panel p-6"
                }
              >
                <h3 className="text-lg font-medium text-ink">{column.title}</h3>
                <ul className="mt-4 space-y-3 text-sm leading-relaxed text-mute">
                  {column.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span className={highlighted ? "text-gold" : "text-faint"} aria-hidden="true">
                        {highlighted ? "✓" : "·"}
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <p className="mt-10 max-w-3xl text-lg leading-relaxed text-ink">{COMPARISON.closer}</p>
      </Container>
    </section>
  );
}
