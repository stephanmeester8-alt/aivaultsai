import { Container } from "./container";
import { SectionHeading } from "./section-heading";

const products = [
  {
    name: "AI Automation Quickstart",
    price: "€495",
    suffix: "eenmalig",
    description: "Vind één proces dat onnodig veel tijd kost en laat ons het automatiseren.",
    features: [
      "30–45 min intake",
      "Analyse van één bedrijfsproces",
      "Automatiseringsontwerp",
      "Werkend prototype",
      "Korte oplevering en uitleg",
    ],
    cta: "Start met Quickstart",
    featured: true,
  },
  {
    name: "AI Website Assistent",
    price: "€795",
    suffix: "+ €49/mnd",
    description: "Een AI-assistent op je website die vragen beantwoordt en potentiële klanten opvangt.",
    features: [
      "Website AI-assistent",
      "Antwoorden op veelgestelde vragen",
      "Leadgegevens verzamelen",
      "Kennis uit jouw bedrijfsinformatie",
      "Beheer en optimalisatie",
    ],
    cta: "Bekijk website-assistent",
    featured: false,
  },
  {
    name: "AI Lead Automation",
    price: "Vanaf €995",
    suffix: "implementatie",
    description: "Laat aanvragen automatisch lezen, kwalificeren, samenvatten en opvolgen.",
    features: [
      "Lead intake automatiseren",
      "AI-kwalificatie en samenvatting",
      "Automatische opvolging",
      "Koppeling met bestaande tools",
      "Uitbreidbaar naar maatwerk",
    ],
    cta: "Bespreek lead automation",
    featured: false,
  },
] as const;

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-24 border-b border-line py-20 sm:py-24" aria-labelledby="pricing-heading">
      <Container>
        <SectionHeading
          id="pricing-heading"
          index="02"
          eyebrow="Diensten"
          title="Begin met één probleem. Niet met een groot IT-project."
        >
          Kies een concreet proces, laat het automatiseren en bepaal daarna samen wat de volgende stap is.
        </SectionHeading>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.name}
              className={`flex flex-col border bg-panel p-6 sm:p-7 ${product.featured ? "border-gold/60" : "border-line"}`}
            >
              {product.featured ? (
                <p className="font-mono text-[10px] tracking-[0.18em] text-gold uppercase">Aanbevolen start</p>
              ) : null}
              <h3 className="mt-3 text-xl font-medium tracking-tight text-ink">{product.name}</h3>
              <p className="mt-4 text-sm leading-relaxed text-mute">{product.description}</p>

              <div className="mt-7 border-y border-line py-5">
                <p className="text-3xl font-medium tracking-tight text-ink">{product.price}</p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">{product.suffix}</p>
              </div>

              <ul className="mt-6 space-y-3 text-sm text-mute">
                {product.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <span className="mt-2 h-1 w-1 shrink-0 bg-gold" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href="#contact"
                className={`mt-8 inline-flex items-center justify-center rounded-sm px-4 py-3 text-sm font-medium no-underline ${
                  product.featured
                    ? "bg-ink text-canvas hover:bg-gold"
                    : "border border-line text-ink hover:border-gold/50"
                }`}
              >
                {product.cta}
              </a>
            </article>
          ))}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-faint">
          Prijzen zijn een startpunt. Externe software-, API- of licentiekosten zijn niet inbegrepen wanneer die voor een specifieke automatisering nodig zijn.
        </p>
      </Container>
    </section>
  );
}
