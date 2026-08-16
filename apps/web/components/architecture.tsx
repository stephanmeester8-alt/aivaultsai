import { Container } from "./container";
import { SectionHeading } from "./section-heading";

const BENEFITS = [
  ["Concreet", "We beginnen met één duidelijk bedrijfsprobleem."],
  ["Gecontroleerd", "Automatisering wordt eerst getest en ingericht voordat ze in gebruik gaat."],
  ["Uitbreidbaar", "Een kleine automatisering kan later doorgroeien naar een groter AI-proces."],
  ["Menselijk waar nodig", "Belangrijke beslissingen blijven onder controle van de ondernemer."],
] as const;

export function Architecture() {
  return (
    <section
      id="architecture"
      className="scroll-mt-24 border-b border-line py-20 sm:py-24"
      aria-labelledby="architecture-heading"
    >
      <Container>
        <SectionHeading
          id="architecture-heading"
          index="06"
          eyebrow="Onze aanpak"
          title="AI die past bij hoe jouw bedrijf werkt."
        >
          Geen black box en geen groot IT-project als eerste stap. We brengen het proces in kaart, bepalen waar AI
          waarde toevoegt en bouwen vervolgens alleen wat nodig is.
        </SectionHeading>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {BENEFITS.map(([title, detail]) => (
            <article key={title} className="border border-line bg-panel p-6">
              <h3 className="text-base font-medium text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{detail}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 border border-gold/40 bg-panel p-6 sm:p-8">
          <p className="font-mono text-[10px] tracking-[0.18em] text-gold uppercase">Van idee naar resultaat</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-4">
            {["Probleem", "Ontwerp", "Bouwen", "Verbeteren"].map((stage, index) => (
              <div key={stage} className="border border-line bg-canvas p-4">
                <p className="font-mono text-[10px] text-faint">0{index + 1}</p>
                <p className="mt-2 text-sm font-medium text-ink">{stage}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
