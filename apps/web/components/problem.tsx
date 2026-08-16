import { Container } from "./container";
import { SectionHeading } from "./section-heading";

const PRINCIPLES = [
  { term: "Tasks", copy: "Work is a lifecycle, not a chat thread." },
  { term: "Agents", copy: "Specialists reason and delegate. They do not execute tools directly." },
  { term: "Tools", copy: "Actions happen through defined capabilities — never unbounded access." },
  { term: "Permissions", copy: "Every invocation is checked against policy. Default deny." },
  { term: "Evidence", copy: "Claims are typed, sourced, and separate from inference." },
  { term: "Handoffs", copy: "Collaboration is a structured artifact, not a message." },
];

export function Problem() {
  return (
    <section id="platform" className="scroll-mt-24 border-b border-line py-20 sm:py-24" aria-labelledby="problem-heading">
      <Container>
        <SectionHeading id="problem-heading" index="01" eyebrow="Platform" title="AI can answer. Work requires execution.">
          Traditional AI interfaces mainly produce responses. Real work needs assignment, authorization,
          verification, and a record of what happened. AIVaultsAI is designed around that operating
          model — not an unrestricted prompt.
        </SectionHeading>
        <ul className="mt-12 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((item) => (
            <li key={item.term} className="bg-canvas p-6">
              <p className="font-mono text-[11px] tracking-[0.16em] text-gold uppercase">{item.term}</p>
              <p className="mt-3 text-sm leading-relaxed text-mute">{item.copy}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
