/**
 * AI-assistent + cursus + onboarding — pagina-content (één bron van waarheid).
 *
 * Prijs: €249 eenmalig, EXCLUSIEF btw (bevestigd door eigenaar).
 * Disclaimer: het product/de pagina is een testversie; tijdens het integreren
 * van updates kunnen functies tijdelijk niet beschikbaar zijn.
 *
 * Regels:
 * - geen niet-bevestigde functionaliteiten, garanties of voorwaarden;
 * - geen doorgestreepte nep-prijzen;
 * - onboarding: online via Microsoft Teams; op locatie alleen "indien praktisch".
 */

export const PRICE = {
  amount: "€249",
  taxNote: "excl. btw",
  oneTime: "eenmalig",
} as const;

export const DISCLAIMER =
  "Testversie — tijdens het integreren van updates kunnen functies tijdelijk niet beschikbaar zijn.";

/** CTA-doel: de webshop-productpagina (beveiligde checkout via Stripe). */
export const OFFER_CTA_HREF = "/shop/ai-assistent-pakket";

export const OFFER_CTA_LABEL = "Start met mijn AI-assistent";

export const HERO = {
  eyebrow: "AI-assistent · praktische cursus · 1 uur persoonlijke onboarding",
  title: "Geen AI-assistent in de la. Een AI-assistent in je werk.",
  lead:
    "Je krijgt niet alleen een AI-assistent. Je leert ook hoe je hem optimaal inzet — met een praktische cursus en een uur persoonlijke begeleiding.",
  ctaLabel: OFFER_CTA_LABEL,
  ctaHref: OFFER_CTA_HREF,
  secondaryLabel: "Bekijk eerst wat je precies krijgt",
  secondaryHref: "#pakket",
  micro: `${PRICE.amount} ${PRICE.taxNote}, ${PRICE.oneTime} · geen abonnement · onboarding via Microsoft Teams inbegrepen`,
} as const;

export const PROBLEM = {
  eyebrow: "Het probleem",
  title: "AI kopen is makkelijk. Resultaat halen is een ander verhaal.",
  lead:
    "Toegang tot een AI-assistent zegt nog niets over wat je ermee bereikt. De meeste gebruikers blijven steken op het oppervlak — niet omdat ze ongemotiveerd zijn, maar omdat niemand hen heeft laten zien hoe het werkt.",
  cards: [
    {
      title: "Oppervlakkig gebruik",
      detail: "Dezelfde drie standaardvragen, week na week — terwijl de assistent veel meer kan.",
    },
    {
      title: "Onbekende opdrachten",
      detail: "Je weet niet wát je moet vragen om het juiste antwoord te krijgen.",
    },
    {
      title: "Wisselende resultaten",
      detail: "Vandaag goed, morgen tegenvallend — zonder te weten waarom.",
    },
    {
      title: "Geen plek in je werkdag",
      detail: "De assistent blijft een los tabblad, in plaats van onderdeel van je proces.",
    },
  ],
  bridge:
    "Daarom krijg je bij deze assistent niet alleen toegang. Je krijgt de cursus én een uur persoonlijke begeleiding om er daadwerkelijk mee aan de slag te gaan.",
} as const;

export const PACKAGE = {
  eyebrow: "Het pakket",
  title: "Eén pakket. Drie onderdelen die samen het product vormen.",
  lead: `${PRICE.amount} ${PRICE.taxNote}, ${PRICE.oneTime} — alles inbegrepen. Geen abonnement, geen verborgen kosten.`,
  items: [
    {
      title: "De AI-assistent",
      detail:
        "Jouw assistent om productiever te werken: onderzoek doen naar websites en bedrijven, teksten en e-mails voorbereiden, documenten verwerken, ideeën structureren en plannen maken, klantvragen beantwoorden en leadwerk ondersteunen.",
    },
    {
      title: "De complete cursus",
      detail:
        "Een praktische cursus, geen theorie: hoe je goede opdrachten geeft, betere resultaten krijgt en de assistent onderdeel maakt van je dagelijkse werk. In je eigen tempo.",
    },
    {
      title: "1 uur persoonlijke onboarding",
      detail:
        "Je hoeft het niet alleen uit te zoeken. Na aankoop plannen we een uur waarin we je op weg helpen, je vragen beantwoorden en naar jouw manier van werken kijken.",
    },
  ],
  onboardingNote:
    "Online via Microsoft Teams — ideaal als je verder weg woont. Woon je dichtbij en is het praktisch? Dan kom ik ook persoonlijk langs.",
} as const;

export const COURSE = {
  eyebrow: "De cursus",
  title: "Een cursus die eindigt in jouw werkdag — niet in een mapje \u201clater\u201d.",
  lead:
    "Acht hoofdstukken, van de eerste kennismaking tot jouw persoonlijke werkwijze. De basis is in ongeveer een half uur te doen. Elk hoofdstuk eindigt met een opdracht die je direct in je eigen werk gebruikt. Bij de cursus hoort een set praktische prompts die je direct kunt inzetten.",
  chapters: [
    {
      number: "01",
      title: "Je assistent leren kennen",
      learn: "Wat de assistent kan, hoe je hem benadert en de drie eerste opdrachten die altijd werken.",
      result: "Je eerste echte taak is vandaag afgerond.",
    },
    {
      number: "02",
      title: "De basis goed gebruiken",
      learn: "De bouwstenen van een goede opdracht: rol, context en gewenst resultaat.",
      result: "Je zet elke taak om in een duidelijke opdracht.",
    },
    {
      number: "03",
      title: "Betere resultaten krijgen",
      learn: "Doorvragen, bijsturen en output controleren — het verschil tussen een gemiddeld en een sterk antwoord.",
      result: "Voorspelbaar betere antwoorden, niet toevallig betere.",
    },
    {
      number: "04",
      title: "De assistent in je dagelijkse werk",
      learn: "Terugkerende taken herkennen en overdragen, van e-mails en notities tot verslagen en planning.",
      result: "Drie taken uit jouw week zijn overgedragen.",
    },
    {
      number: "05",
      title: "Slimme workflows",
      learn: "Vaste stappenreeksen bouwen voor werk dat je wekelijks doet — zelfde kwaliteit, elke keer.",
      result: "Eén workflow die vanaf morgen draait.",
    },
    {
      number: "06",
      title: "Verder dan de basis",
      learn: "Grotere klussen opdelen en gestructureerd aanpakken.",
      result: "Je pakt een taak aan die je eerder \u201cte groot\u201d vond.",
    },
    {
      number: "07",
      title: "Veelgemaakte fouten",
      learn: "De zes fouten die beginners het meeste tijd kosten — en hoe je ze herkent.",
      result: "Je voorkomt ze voordat ze jouw tijd kosten.",
    },
    {
      number: "08",
      title: "Jouw persoonlijke werkwijze",
      learn: "Alles samenvoegen tot één systeem dat past bij jouw werk, inclusief wanneer je de assistent bewust niet inzet.",
      result: "Een vaste werkwijze die dagelijks rendement oplevert.",
    },
  ],
} as const;

export const ONBOARDING = {
  eyebrow: "Persoonlijke onboarding",
  title: "Je hoeft het niet alleen uit te zoeken.",
  lead:
    "Na je aankoop plannen we één uur persoonlijke onboarding. Doel: je goed op weg helpen — geen presentatie, geen theorie.",
  points: [
    "Je assistent staat klaar en je weet hoe je begint.",
    "We bespreken hoe jij de assistent in jouw werk kunt gebruiken.",
    "Al je vragen worden beantwoord.",
    "We kijken naar jouw manier van werken — niet naar een standaardsituatie.",
  ],
  how:
    "Online via Microsoft Teams — ideaal voor klanten die verder weg wonen. Woon je dichtbij en is het praktisch? Dan kom ik ook persoonlijk langs.",
} as const;

export const COMPARISON = {
  eyebrow: "Waarom deze combinatie",
  title: "Waarom dit pakket sterker is dan alleen een assistent.",
  columns: [
    {
      title: "Alleen een AI-assistent",
      points: [
        "Je krijgt de technologie en zoekt zelf uit hoe je haar gebruikt.",
        "Zonder vaste werkwijze blijven resultaten wisselend.",
        "Veel kans dat de assistent na een paar weken in de la belandt.",
      ],
    },
    {
      title: "AI-assistent + cursus + onboarding",
      points: [
        "Je krijgt de technologie én leert haar effectief inzetten.",
        "Je start met begeleiding in plaats van giswerk.",
        "Je bouwt een werkwijze die blijft — en die je zelf kunt aanpassen.",
      ],
      highlight: true,
    },
  ],
  closer:
    "Je koopt niet alleen toegang. Je leert ermee werken. Dat is het verschil tussen een aankoop en een investering.",
} as const;

export const VALUE = {
  eyebrow: "De prijs",
  title: "Eén prijs. Geen verrassingen.",
  includes: [
    "De AI-assistent",
    "De complete praktische cursus — 8 hoofdstukken met opdrachten",
    "Een set praktische prompts om direct mee te werken",
    "1 uur persoonlijke onboarding",
    "Online begeleiding via Microsoft Teams",
    "Persoonlijk op locatie, indien praktisch",
  ],
  rationaleTitle: "Waarom €249 redelijk is",
  rationale:
    "De redenering is simpel. Als de assistent je structureel tijd bespaart — één uur per week is al vijftig uur per jaar — dan verdient de investering zich relatief snel terug. Hoeveel tijd je bespaart, hangt af van hoe je hem inzet. En precies dat leer je in de cursus en de onboarding. Er wordt geen besparing gegarandeerd: het resultaat hangt af van jouw gebruik.",
} as const;

export const FAQ = {
  eyebrow: "Veelgestelde vragen",
  title: "Antwoorden op je vragen",
  items: [
    {
      question: "Wat krijg ik precies voor €249?",
      answer:
        "De AI-assistent, de complete praktische cursus en één uur persoonlijke onboarding. De prijs is exclusief btw.",
    },
    {
      question: "Is de cursus inbegrepen?",
      answer: "Ja — de cursus is onderdeel van het pakket, geen losse verkoop.",
    },
    {
      question: "Krijg ik persoonlijke begeleiding?",
      answer: "Ja — één uur persoonlijke onboarding zit bij elke aankoop inbegrepen.",
    },
    {
      question: "Hoe werkt de onboarding?",
      answer:
        "We plannen een uur waarin we je op weg helpen, naar jouw werkwijze kijken en je vragen beantwoorden.",
    },
    {
      question: "Kan de onboarding online?",
      answer: "Ja — via Microsoft Teams.",
    },
    {
      question: "Kan je ook bij mij langskomen?",
      answer:
        "Als je dichtbij woont en het praktisch is, kom ik persoonlijk langs. Online via Teams is altijd mogelijk — een fysieke afspraak is niet automatisch inbegrepen.",
    },
    {
      question: "Heb ik technische kennis nodig?",
      answer:
        "Nee. Hoofdstuk 1 van de cursus brengt je in ongeveer een half uur naar de basis; daarna bouw je stap voor stap verder.",
    },
    {
      question: "Hoe lang duurt de cursus?",
      answer:
        "De basis is in ongeveer een half uur te doen. Daarna bepaal je zelf het tempo; elk hoofdstuk bouwt voort op het vorige.",
    },
    {
      question: "Kan ik de cursus op mijn eigen tempo volgen?",
      answer: "Ja — er zijn geen deadlines.",
    },
    {
      question: "Is €249 een eenmalige betaling?",
      answer: "Ja — €249 exclusief btw, eenmalig. Geen abonnement, geen verborgen kosten.",
    },
    {
      question: "Wat gebeurt er na mijn aankoop?",
      answer:
        "Je ontvangt je toegang tot de assistent en de cursus, en we plannen je uur persoonlijke onboarding. De exacte toegangsstappen worden bij je bestelling bevestigd.",
    },
    {
      question: "Kan er tijdelijk iets niet werken?",
      answer:
        "Dit is een testversie. Tijdens het integreren van updates kunnen functies tijdelijk niet beschikbaar zijn.",
    },
  ],
} as const;

export const CTA = {
  eyebrow: "Klaar om te starten",
  title: "Koop geen AI-assistent die in de la belandt. Koop er één waar je mee leert werken.",
  lead: "De assistent, de cursus en het uur persoonlijke begeleiding — alles voor één prijs.",
  label: "Aan de slag met mijn AI-assistent",
  href: OFFER_CTA_HREF,
  micro: `${PRICE.amount} ${PRICE.taxNote}, ${PRICE.oneTime} · onboarding via Teams inbegrepen · ${DISCLAIMER}`,
} as const;
