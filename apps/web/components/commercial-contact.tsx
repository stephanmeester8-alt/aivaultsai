import { Container } from "./container";
import { SectionHeading } from "./section-heading";

export function CommercialContact() {
  return (
    <section id="contact" className="scroll-mt-24 border-t border-line py-20 sm:py-24" aria-labelledby="contact-heading">
      <Container className="max-w-4xl">
        <SectionHeading
          id="contact-heading"
          index="10"
          eyebrow="Start hier"
          title="Heb je een proces waarvan je denkt: dit moet toch slimmer kunnen?"
        >
          Vertel kort wat er nu gebeurt, hoeveel tijd het kost en welke tools je gebruikt. We bepalen samen of AI-automatisering zinvol is en waar je het beste kunt beginnen.
        </SectionHeading>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <div className="border border-line bg-panel p-6">
            <p className="font-mono text-[10px] tracking-[0.16em] text-gold uppercase">Gratis eerste gesprek</p>
            <h3 className="mt-3 text-lg font-medium text-ink">Bespreek jouw proces</h3>
            <p className="mt-3 text-sm leading-relaxed text-mute">
              Geen verkooppraatje en geen verplicht groot traject. We kijken eerst of het probleem geschikt is voor automatisering.
            </p>
          </div>
          <div className="border border-line bg-panel p-6">
            <p className="font-mono text-[10px] tracking-[0.16em] text-gold uppercase">Wat je voorbereidt</p>
            <h3 className="mt-3 text-lg font-medium text-ink">Eén concreet voorbeeld</h3>
            <p className="mt-3 text-sm leading-relaxed text-mute">
              Bijvoorbeeld een terugkerende e-mail, offerte-aanvraag, klantvraag, document of administratieve taak die steeds opnieuw handmatig wordt uitgevoerd.
            </p>
          </div>
        </div>

        <div className="mt-8 border border-gold/40 bg-panel p-6 sm:p-8">
          <p className="text-base font-medium text-ink">Klaar om te kijken wat we kunnen automatiseren?</p>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Gebruik de contactgegevens die je voor AIVaultsAI gebruikt om een kennismaking aan te vragen. We starten met één proces en houden het praktisch.
          </p>
        </div>
      </Container>
    </section>
  );
}
