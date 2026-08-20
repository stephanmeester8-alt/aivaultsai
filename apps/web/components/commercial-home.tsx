import { Container } from "./container";
import { LiveAssistant } from "./live-assistant";

const solutions = [
  {
    number: "01",
    name: "AIVaults Web",
    title: "Je digitale voordeur",
    description:
      "Een snelle, professionele website die niet alleen informatie geeft, maar bezoekers naar een duidelijke volgende stap stuurt.",
    points: [
      "Maatwerk design",
      "Mobiel-first",
      "SEO-basis",
      "Conversiegerichte CTA's",
      "Hosting en SSL",
    ],
    href: "/websites",
  },
  {
    number: "02",
    name: "AIVaults AI",
    title: "Je digitale medewerker",
    description:
      "Een AI-assistent die bezoekers te woord staat, vragen beantwoordt, leads opvangt en — wanneer ingericht — helpt richting een afspraak.",
    points: [
      "24/7 beschikbaar",
      "Bedrijfskennis",
      "Leadkwalificatie",
      "Afspraken",
      "Meertalig mogelijk",
    ],
    href: "/ai-assistenten",
  },
  {
    number: "03",
    name: "AIVaults Flow",
    title: "Je digitale workflow",
    description:
      "Automatiseer terugkerend werk achter je website: aanvragen, opvolging, e-mail, documenten en koppelingen met bestaande tools.",
    points: [
      "Lead routing",
      "Automatische opvolging",
      "Procesautomatisering",
      "Tool-integraties",
      "Maatwerk workflows",
    ],
    href: "/leadautomatisering",
  },
] as const;

const packages = [
  {
    name: "WEB",
    title: "Website die verkoopt",
    price: "€495",
    suffix: "vanaf · eenmalig",
    description:
      "Voor bedrijven die een professionele digitale basis nodig hebben.",
    features: [
      "Maatwerk homepage",
      "Mobiel geoptimaliseerd",
      "SEO-ready structuur",
      "Contact- of aanvraagformulier",
      "1 revisieronde",
    ],
    cta: "Kies Web",
    featured: false,
  },
  {
    name: "AI",
    title: "Website + AI-assistent",
    price: "€795",
    suffix: "+ €49/mnd · vanaf",
    description:
      "Voor bedrijven die bezoekers ook buiten kantooruren willen kunnen opvangen.",
    features: [
      "Alles uit Web",
      "AI-assistent op de website",
      "Eigen bedrijfskennis",
      "Leadgegevens verzamelen",
      "Beheer en optimalisatie",
    ],
    cta: "Kies AI",
    featured: true,
  },
  {
    name: "FLOW",
    title: "AI Lead & Automation",
    price: "€995",
    suffix: "vanaf · implementatie",
    description:
      "Voor bedrijven die aanvragen en terugkerend werk slimmer willen laten doorstromen.",
    features: [
      "Leadkwalificatie",
      "Automatische opvolging",
      "Afsprakenflow mogelijk",
      "Koppelingen met bestaande tools",
      "Uitbreidbaar naar maatwerk",
    ],
    cta: "Bespreek Flow",
    featured: false,
  },
] as const;

const capabilities = [
  [
    "Leadopvang",
    "Vangt aanvragen op en verzamelt de informatie die jij nodig hebt.",
  ],
  [
    "AI klantenservice",
    "Beantwoordt veelgestelde vragen op basis van jouw eigen bedrijfsinformatie.",
  ],
  [
    "Afspraken",
    "Kan bezoekers begeleiden naar een afspraak wanneer jouw agenda en workflow dat ondersteunen.",
  ],
  [
    "Opvolging",
    "Zet nieuwe aanvragen door en kan vervolgstappen automatiseren.",
  ],
  [
    "Offerte-intake",
    "Vraagt gericht door zodat jij een completere aanvraag ontvangt.",
  ],
  [
    "Automatisering",
    "Verbindt website, formulieren, e-mail en andere bedrijfssystemen.",
  ],
] as const;

const industries = [
  [
    "Bouw & installatie",
    "Offerteaanvragen, projectinformatie, planning en leadkwalificatie.",
  ],
  [
    "Lokale dienstverlening",
    "Meer aanvragen uit de website en minder gemiste telefoontjes.",
  ],
  [
    "Advies & zakelijke dienstverlening",
    "Intake, kwalificatie, afspraken en opvolging.",
  ],
  [
    "Praktijken & afsprakenbedrijven",
    "Veelgestelde vragen en een duidelijke route naar een afspraak.",
  ],
] as const;

const steps = [
  [
    "01",
    "Kies je doel",
    "Meer leads, meer afspraken, minder handwerk of gewoon een betere website.",
  ],
  [
    "02",
    "We ontwerpen de oplossing",
    "We bepalen wat de klant ziet, wat AI doet en welke processen erachter zitten.",
  ],
  [
    "03",
    "We bouwen en testen",
    "Je krijgt een werkende oplossing en kunt feedback geven voordat we live gaan.",
  ],
  [
    "04",
    "We groeien verder",
    "Werkt het? Dan voegen we automatisering, integraties of extra AI-functionaliteit toe.",
  ],
] as const;

const faqs = [
  [
    "Moet ik al een website hebben?",
    "Nee. We kunnen een nieuwe website bouwen of een bestaande website als startpunt gebruiken.",
  ],
  [
    "Kan de AI afspraken maken?",
    "Ja, wanneer de gekozen agenda- en afsprakenworkflow daarvoor wordt ingericht. We bepalen vooraf wat de assistent wel en niet mag doen.",
  ],
  [
    "Kan de AI mijn bedrijfsinformatie gebruiken?",
    "Ja. De assistent kan worden ingericht rond aangeleverde informatie zoals diensten, werkwijze, veelgestelde vragen en andere goedgekeurde kennis.",
  ],
  [
    "Kan ik klein beginnen?",
    "Juist. Je kunt starten met alleen een website of één concreet automatiseringsprobleem en later uitbreiden.",
  ],
  [
    "Zijn alle AI-functies standaard inbegrepen?",
    "Nee. De exacte functionaliteit hangt af van het gekozen pakket en de benodigde integraties. Externe software- en API-kosten worden vooraf besproken.",
  ],
  [
    "Wat is leadautomatisering?",
    "AIVaultsAI Flow automatiseert terugkerend werk achter je website: aanvragen, opvolging, e-mail, documenten en koppelingen met bestaande tools.",
  ],
  [
    "Voor welke bedrijven is dit geschikt?",
    "AIVaultsAI werkt voor bedrijven in onder meer bouw & installatie, lokale dienstverlening, advies & zakelijke dienstverlening en praktijken & afsprakenbedrijven.",
  ],
] as const;

export function CommercialHome() {
  return (
    <>
      {/* HERO */}
      <section
        className="border-b border-line"
        aria-labelledby="hero-heading"
      >
        <Container className="py-16 sm:py-24 lg:py-28">
          <div className="max-w-5xl">
            <p className="font-mono text-[11px] tracking-[0.2em] text-gold uppercase">
              AI systems for business
            </p>

            <h1
              id="hero-heading"
              className="mt-5 max-w-5xl text-4xl font-medium tracking-tight text-ink sm:text-6xl lg:text-7xl"
            >
              Je website hoeft niet alleen mooi te zijn.
              <span className="block text-gold">
                Hij moet voor je werken.
              </span>
            </h1>

            <p className="mt-7 max-w-3xl text-base leading-relaxed text-mute sm:text-xl">
              AIVaultsAI helpt bedrijven met websites, AI-assistenten en
              leadautomatisering: bezoekers opvangen, leads kwalificeren en
              werk slimmer organiseren.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#pricing"
                className="inline-flex items-center justify-center rounded-sm bg-ink px-6 py-3.5 text-sm font-medium text-canvas no-underline hover:bg-gold"
              >
                Bekijk oplossingen →
              </a>

              <a
                href="#contact"
                className="inline-flex items-center justify-center rounded-sm border border-line px-6 py-3.5 text-sm font-medium text-ink no-underline hover:border-gold/60"
              >
                Bespreek jouw bedrijf
              </a>
            </div>
          </div>

          <div className="mt-14 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
            {[
              ["WEBSITE", "Je digitale voordeur"],
              ["AI", "Je digitale medewerker"],
              ["AUTOMATION", "Je digitale workflow"],
            ].map(([label, detail]) => (
              <div key={label} className="bg-panel p-5 sm:p-6">
                <p className="font-mono text-[10px] tracking-[0.18em] text-gold">
                  {label}
                </p>

                <p className="mt-2 text-sm text-ink">{detail}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* LIVE AI ASSISTANT */}
      <LiveAssistant />

      {/* SOLUTIONS */}
      <section
        id="solutions"
        className="scroll-mt-24 border-b border-line py-20 sm:py-24"
        aria-labelledby="solutions-heading"
      >
        <Container>
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] tracking-[0.18em] text-gold uppercase">
              01 / Oplossingen
            </p>

            <h2
              id="solutions-heading"
              className="mt-4 text-3xl font-medium tracking-tight text-ink sm:text-4xl"
            >
              Kies wat je bedrijf nodig heeft.
            </h2>

            <p className="mt-4 text-base leading-relaxed text-mute sm:text-lg">
              Geen technisch verhaal. Kies het resultaat waar je nu het meeste
              aan hebt en bouw daarna verder.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {solutions.map((solution) => (
              <article
                key={solution.name}
                className="flex flex-col border border-line bg-panel p-6 sm:p-7"
              >
                <p className="font-mono text-xs tracking-[0.18em] text-gold">
                  {solution.number}
                </p>

                <p className="mt-6 font-mono text-[10px] tracking-[0.16em] text-faint uppercase">
                  {solution.name}
                </p>

                <h3 className="mt-2 text-2xl font-medium tracking-tight text-ink">
                  {solution.title}
                </h3>

                <p className="mt-4 text-sm leading-relaxed text-mute">
                  {solution.description}
                </p>

                <ul className="mt-6 space-y-3 border-t border-line pt-5 text-sm text-mute">
                  {solution.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span className="text-gold">✓</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href={solution.href}
                  className="mt-7 inline-flex text-sm font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-gold"
                >
                  Meer over {solution.name} →
                </a>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* AI */}
      <section
        id="ai"
        className="scroll-mt-24 border-b border-line py-20 sm:py-24"
        aria-labelledby="ai-heading"
      >
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="font-mono text-[11px] tracking-[0.18em] text-gold uppercase">
                02 / AI-assistent
              </p>

              <h2
                id="ai-heading"
                className="mt-4 text-3xl font-medium tracking-tight text-ink sm:text-4xl"
              >
                Een digitale medewerker die ook werkt als jij even niet
                beschikbaar bent.
              </h2>

              <p className="mt-5 text-base leading-relaxed text-mute">
                Een bezoeker hoeft niet te wachten op een antwoord. Een
                AI-assistent kan vragen beantwoorden, informatie verzamelen en
                een lead naar de volgende stap begeleiden.
              </p>

              <div className="mt-7 border border-gold/30 bg-panel p-5">
                <p className="font-mono text-[10px] tracking-[0.16em] text-gold uppercase">
                  Voorbeeld
                </p>

                <p className="mt-3 text-sm leading-relaxed text-ink">
                  “Ik wil een offerte voor mijn tuin.”
                </p>

                <p className="mt-2 text-sm leading-relaxed text-mute">
                  De assistent kan doorvragen naar type werk, locatie,
                  gewenste termijn en contactgegevens — precies volgens de
                  workflow die we samen instellen.
                </p>
              </div>
            </div>

            <div className="border border-line bg-panel p-6 sm:p-8">
              <div className="space-y-0">
                {capabilities.slice(0, 3).map(([title, detail], index) => (
                  <div
                    key={title}
                    className="border-b border-line py-5 first:pt-0 last:border-b-0"
                  >
                    <div className="flex gap-4">
                      <span className="font-mono text-xs text-gold">
                        0{index + 1}
                      </span>

                      <div>
                        <h3 className="text-base font-medium text-ink">
                          {title}
                        </h3>

                        <p className="mt-2 text-sm leading-relaxed text-mute">
                          {detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-line pt-6">
                <p className="text-sm font-medium text-ink">
                  Belangrijk: de assistent doet alleen wat we vooraf bepalen.
                </p>

                <p className="mt-2 text-xs leading-relaxed text-faint">
                  Geen onbeheerde beloftes, geen verzonnen informatie en geen
                  acties buiten de afgesproken workflow.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* AUTOMATION */}
      <section
        id="automation"
        className="scroll-mt-24 border-b border-line py-20 sm:py-24"
        aria-labelledby="automation-heading"
      >
        <Container>
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] tracking-[0.18em] text-gold uppercase">
              03 / Lead engine & automation
            </p>

            <h2
              id="automation-heading"
              className="mt-4 text-3xl font-medium tracking-tight text-ink sm:text-4xl"
            >
              Van bezoeker naar lead. Van lead naar actie.
            </h2>

            <p className="mt-4 text-base leading-relaxed text-mute sm:text-lg">
              Je website kan het begin zijn van een workflow in plaats van het
              eindpunt.
            </p>
          </div>

          <div className="mt-10 overflow-hidden border border-line bg-panel">
            <div className="grid md:grid-cols-7">
              {[
                ["01", "Bezoeker", "Komt binnen"],
                ["02", "Website", "Vindt antwoord"],
                ["03", "AI", "Vraagt door"],
                ["04", "Lead", "Wordt gekwalificeerd"],
                ["05", "Agenda", "Afspraak mogelijk"],
                ["06", "Opvolging", "Automatische stap"],
                ["07", "Jij", "Krijgt een bruikbare aanvraag"],
              ].map(([number, title, detail]) => (
                <div
                  key={number}
                  className="border-b border-line p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
                >
                  <p className="font-mono text-[10px] tracking-[0.16em] text-gold">
                    {number}
                  </p>

                  <h3 className="mt-4 text-sm font-medium text-ink">
                    {title}
                  </h3>

                  <p className="mt-2 text-xs leading-relaxed text-mute">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {capabilities.slice(3).map(([title, detail]) => (
              <article key={title} className="border border-line p-5">
                <h3 className="text-sm font-medium text-ink">{title}</h3>

                <p className="mt-2 text-sm leading-relaxed text-mute">
                  {detail}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* PRICING */}
      <section
        id="pricing"
        className="scroll-mt-24 border-b border-line py-20 sm:py-24"
        aria-labelledby="pricing-heading"
      >
        <Container>
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] tracking-[0.18em] text-gold uppercase">
              04 / Aanbod
            </p>

            <h2
              id="pricing-heading"
              className="mt-4 text-3xl font-medium tracking-tight text-ink sm:text-4xl"
            >
              Begin klein. Bouw verder wanneer het werkt.
            </h2>

            <p className="mt-4 text-base leading-relaxed text-mute sm:text-lg">
              Duidelijke startprijzen. Maatwerk en externe softwarekosten
              bespreken we vooraf.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {packages.map((product) => (
              <article
                key={product.name}
                className={`flex flex-col border bg-panel p-6 sm:p-7 ${
                  product.featured ? "border-gold/60" : "border-line"
                }`}
              >
                {product.featured ? (
                  <p className="font-mono text-[10px] tracking-[0.18em] text-gold uppercase">
                    Meest gekozen
                  </p>
                ) : (
                  <p className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase">
                    {product.name}
                  </p>
                )}

                <h3 className="mt-3 text-2xl font-medium tracking-tight text-ink">
                  {product.title}
                </h3>

                <p className="mt-4 text-sm leading-relaxed text-mute">
                  {product.description}
                </p>

                <div className="mt-7 border-y border-line py-5">
                  <p className="text-4xl font-medium tracking-tight text-ink">
                    {product.price}
                  </p>

                  <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
                    {product.suffix}
                  </p>
                </div>

                <ul className="mt-6 flex-1 space-y-3 text-sm text-mute">
                  {product.features.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <span className="text-gold">✓</span>
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
                  {product.cta} →
                </a>
              </article>
            ))}
          </div>

          <p className="mt-6 text-xs leading-relaxed text-faint">
            Prijzen zijn vanafprijzen en exclusief btw. Externe software-,
            API-, agenda- of andere licentiekosten zijn niet inbegrepen
            wanneer die voor de gekozen oplossing nodig zijn.
          </p>
        </Container>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        className="scroll-mt-24 border-b border-line py-20 sm:py-24"
        aria-labelledby="how-heading"
      >
        <Container>
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] tracking-[0.18em] text-gold uppercase">
              05 / Zo werkt het
            </p>

            <h2
              id="how-heading"
              className="mt-4 text-3xl font-medium tracking-tight text-ink sm:text-4xl"
            >
              Van idee naar een systeem dat echt bij je bedrijf past.
            </h2>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-4">
            {steps.map(([number, title, detail]) => (
              <article key={number} className="bg-panel p-6">
                <p className="font-mono text-xs tracking-[0.18em] text-gold">
                  {number}
                </p>

                <h3 className="mt-5 text-lg font-medium text-ink">
                  {title}
                </h3>

                <p className="mt-3 text-sm leading-relaxed text-mute">
                  {detail}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* INDUSTRIES */}
      <section
        id="industries"
        className="scroll-mt-24 border-b border-line py-20 sm:py-24"
        aria-labelledby="industries-heading"
      >
        <Container>
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] tracking-[0.18em] text-gold uppercase">
              06 / Voor bedrijven
            </p>

            <h2
              id="industries-heading"
              className="mt-4 text-3xl font-medium tracking-tight text-ink sm:text-4xl"
            >
              AI moet aansluiten op je werk. Niet andersom.
            </h2>

            <p className="mt-4 text-base leading-relaxed text-mute">
              Dezelfde techniek kan voor ieder bedrijf een andere oplossing
              betekenen.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {industries.map(([title, detail]) => (
              <article
                key={title}
                className="border border-line bg-panel p-6"
              >
                <h3 className="text-lg font-medium text-ink">{title}</h3>

                <p className="mt-3 text-sm leading-relaxed text-mute">
                  {detail}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="scroll-mt-24 border-b border-line py-20 sm:py-24"
        aria-labelledby="faq-heading"
      >
        <Container className="max-w-4xl">
          <p className="font-mono text-[11px] tracking-[0.18em] text-gold uppercase">
            07 / Veelgestelde vragen
          </p>

          <h2
            id="faq-heading"
            className="mt-4 text-3xl font-medium tracking-tight text-ink sm:text-4xl"
          >
            Eerst duidelijkheid. Dan bouwen.
          </h2>

          <div className="mt-10 border-t border-line">
            {faqs.map(([question, answer]) => (
              <details
                key={question}
                className="border-b border-line py-5"
              >
                <summary className="cursor-pointer text-base font-medium text-ink">
                  {question}
                </summary>

                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-mute">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      {/* CONTACT */}
      <section
        id="contact"
        className="scroll-mt-24 py-20 sm:py-28"
        aria-labelledby="contact-heading"
      >
        <Container className="max-w-5xl">
          <div className="border border-gold/40 bg-panel p-7 sm:p-10 lg:p-12">
            <p className="font-mono text-[11px] tracking-[0.18em] text-gold uppercase">
              08 / Start hier
            </p>

            <h2
              id="contact-heading"
              className="mt-4 max-w-3xl text-3xl font-medium tracking-tight text-ink sm:text-5xl"
            >
              Wat zou jij als eerste willen automatiseren?
            </h2>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-mute">
              Vertel wat je bedrijf doet, waar je nu tijd verliest en wat je
              graag slimmer zou willen maken. We kunnen beginnen met een
              website, een AI-assistent of één concreet proces.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="https://mail.google.com/mail/?view=cm&fs=1&to=aivaultsai@gmail.com&su=Kennismaking%20AIVaultsAI"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-sm bg-ink px-6 py-3.5 text-sm font-medium text-canvas no-underline hover:bg-gold"
              >
                Plan een kennismaking →
              </a>

              <a
                href="https://mail.google.com/mail/?view=cm&fs=1&to=aivaultsai@gmail.com&su=Vraag%20over%20AIVaultsAI"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-sm border border-line px-6 py-3.5 text-sm font-medium text-ink no-underline hover:border-gold/50"
              >
                Stel een vraag
              </a>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}