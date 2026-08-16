import { Container } from "./container";
import { SectionHeading } from "./section-heading";

const AGENTS = [
  {
    name: "Research Intelligence",
    question: "Verzamelt informatie, vergelijkt bronnen en brengt relevante inzichten samen.",
  },
  {
    name: "Product / UX",
    question: "Denkt vanuit de klant en vertaalt een probleem naar een bruikbare oplossing.",
  },
  {
    name: "CTO / AI Architect",
    question: "Bepaalt welke technologie en architectuur nodig zijn om een oplossing goed te bouwen.",
  },
  {
    name: "Principal AI Engineer",
    question: "Werkt uit hoe AI, automatisering en integraties technisch worden gerealiseerd.",
  },
  {
    name: "Growth / Analytics",
    question: "Kijkt naar resultaat, gebruik en verbetering zodat automatiseringen steeds waardevoller worden.",
  },
];

export function Agents() {
  return (
    <section id="agents" className="scroll-mt-24 border-b border-line py-20 sm:py-24" aria-labelledby="agents-heading">
      <Container>
        <SectionHeading id="agents-heading" index="04" eyebrow="AI-specialisten" title="Geen generieke chatbot. Een team van specialisten.">
          Achter iedere automatisering kunnen meerdere AI-specialisten samenwerken. Zo combineren we onderzoek,
          strategie, productdenken en engineering in één gecontroleerde aanpak.
        </SectionHeading>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent, index) => (
            <article
              key={agent.name}
              className={`border border-line bg-panel p-6 ${index === 0 ? "lg:col-span-2" : ""}`}
            >
              <p className="font-mono text-[10px] tracking-[0.18em] text-gold uppercase">
                AI specialist {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 text-lg font-medium tracking-tight text-ink">{agent.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-mute">{agent.question}</p>
            </article>
          ))}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-faint">
          De website presenteert deze architectuur; specifieke automatiseringen worden per klant ingericht en getest.
        </p>
      </Container>
    </section>
  );
}
