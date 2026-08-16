import { Container } from "./container";
import { SectionHeading } from "./section-heading";

const STEPS = [
  {
    number: "01",
    title: "Eén proces",
    detail: "We kiezen samen één terugkerend proces dat tijd, geld of capaciteit kost.",
  },
  {
    number: "02",
    title: "Automatiseren",
    detail: "We ontwerpen en bouwen een praktische AI-oplossing rond dat proces.",
  },
  {
    number: "03",
    title: "Koppelen",
    detail: "Waar nodig verbinden we de automatisering met de tools die je al gebruikt.",
  },
  {
    number: "04",
    title: "Opschalen",
    detail: "Werkt het? Dan kunnen we de oplossing uitbreiden naar meer processen.",
  },
] as const;

export function Roadmap() {
  return (
    <section id="roadmap" className="scroll-mt-24 border-b border-line py-20 sm:py-24" aria-labelledby="roadmap-heading">
      <Container>
        <SectionHeading id="roadmap-heading" index="07" eyebrow="Zo groeien we mee" title="Van één automatisering naar een AI-werkwijze.">
          Je hoeft niet vooraf te weten wat je hele bedrijf met AI moet doen. Begin klein, bewijs de waarde en bouw
          daarna verder.
        </SectionHeading>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <article key={step.number} className="border border-line bg-panel p-6">
              <p className="font-mono text-xs tracking-[0.18em] text-gold">{step.number}</p>
              <h3 className="mt-5 text-lg font-medium tracking-tight text-ink">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-mute">{step.detail}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
