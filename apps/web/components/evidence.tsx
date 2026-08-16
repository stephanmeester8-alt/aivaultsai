import { Container } from "./container";
import { SectionHeading } from "./section-heading";

const TYPES = [
  { term: "Fact", copy: "Observed or documented. Requires a source." },
  { term: "Company claim", copy: "What an organization asserts. Not independently verified." },
  { term: "Independent verification", copy: "Checked against a source that is not the claimant." },
  { term: "Inference", copy: "Reasoned from other records. Not upgraded to fact by confidence." },
  { term: "Hypothesis", copy: "A testable proposition. Explicitly not established." },
];

export function Evidence() {
  return (
    <section className="border-b border-line py-20 sm:py-24" aria-labelledby="evidence-heading">
      <Container className="grid gap-12 lg:grid-cols-2 lg:items-start">
        <SectionHeading
          id="evidence-heading"
          index="05"
          eyebrow="Evidence"
          title="Don't just ask what the AI thinks. Ask what it knows."
        >
          Research is designed to be evidence-driven. Confidence is explicit: high, medium, low, or
          unknown. Provenance records who or what collected the data. Missing sources cannot be high
          confidence. Internet browsing is not live.
        </SectionHeading>
        <div>
          <ul className="divide-y divide-line border-y border-line">
            {TYPES.map((item) => (
              <li key={item.term} className="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
                <p className="font-mono text-xs tracking-[0.12em] text-gold uppercase">{item.term}</p>
                <p className="text-sm leading-relaxed text-mute">{item.copy}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-faint">
            Confidence and provenance travel with the record. Counter-evidence is kept, not omitted.
          </p>
        </div>
      </Container>
    </section>
  );
}
