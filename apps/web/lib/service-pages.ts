/**
 * Commercial service landing pages (TASK 16, IA fase 1).
 *
 * All copy is evidence-backed: it is drawn from the existing homepage
 * (components/commercial-home.tsx), the site configuration
 * (lib/site.ts) and the existing FAQ. No invented claims, prices,
 * integrations, cases or results. Prices are the published "vanaf"
 * prices only.
 */

import { SITE_NAME, SITE_URL } from "./site.ts";

export interface ServicePageFaq {
  question: string;
  answer: string;
}

export interface ServicePageCta {
  label: string;
  href: string;
}

export interface ServicePageConfig {
  slug: string;
  url: string;
  /** Must match the catalog entry in lib/site.ts (SERVICES_SCHEMA). */
  serviceName: string;
  serviceType: string;
  title: string;
  description: string;
  /** Absolute URL of the shared AIVaultsAI OG image (og:image). */
  ogImage: string;
  h1: string;
  /** Direct, answer-first entity statement. */
  hero: string;
  definition: string;
  capabilities: { title: string; detail: string }[];
  audience: string[];
  howItWorks: string[];
  faq: ServicePageFaq[];
  primaryCta: ServicePageCta;
  secondaryCta: ServicePageCta;
  related: { href: string; label: string }[];
}

const CONTACT_MAILTO =
  "https://mail.google.com/mail/?view=cm&fs=1&to=aivaultsai@gmail.com&su=Kennismaking%20AIVaultsAI";

/** Shared AIVaultsAI OG image (app/opengraph-image.tsx route, reachable live). */
const OG_IMAGE = `${SITE_URL}/opengraph-image`;

export const SERVICE_PAGES: readonly ServicePageConfig[] = [
  {
    slug: "ai-assistenten",
    url: `${SITE_URL}/ai-assistenten`,
    serviceName: "AIVaults AI",
    serviceType: "AI-assistenten",
    title: "AI-assistenten voor bedrijven | AIVaultsAI",
    description:
      "Een AI-assistent die bezoekers te woord staat, vragen beantwoordt en leads opvangt — 24/7. Bouw een digitale medewerker voor je bedrijf.",
    ogImage: OG_IMAGE,
    h1: "AI-assistenten voor bedrijven",
    hero: "Een AI-assistent van AIVaultsAI is een digitale medewerker die bezoekers te woord staat, vragen beantwoordt en leads opvangt — ook buiten kantooruren.",
    definition:
      "Een AI-assistent voor bedrijven is een gespreksassistent op je website die met jouw bedrijfsinformatie vragen beantwoordt, bezoekers gericht doorvraagt en commerciële interesse doorgeeft als lead.",
    capabilities: [
      { title: "24/7 beschikbaar", detail: "Bezoekers krijgen direct antwoord, ook buiten kantooruren." },
      { title: "Bedrijfskennis", detail: "De assistent beantwoordt vragen op basis van jouw eigen bedrijfsinformatie." },
      { title: "Leadkwalificatie", detail: "De assistent vraagt gericht door en herkent commerciële interesse in het gesprek." },
      { title: "Afspraken (wanneer ingericht)", detail: "Bezoekers kunnen worden begeleid naar een afspraak wanneer de agenda-workflow daarvoor wordt ingericht." },
      { title: "Meertalig mogelijk", detail: "De assistent kan in meerdere talen worden ingericht." },
    ],
    audience: [
      "Bedrijven die bezoekers ook buiten kantooruren willen opvangen",
      "Bedrijven met veel terugkerende vragen",
      "Bedrijven die meer aanvragen uit hun website willen halen",
    ],
    howItWorks: [
      "We richten de assistent in met jouw bedrijfsinformatie, diensten en veelgestelde vragen.",
      "Bezoekers chatten met de assistent op je website.",
      "De assistent beantwoordt vragen, vraagt gericht door en herkent commerciële intentie.",
      "Interesse wordt doorgegeven als gekwalificeerde lead voor jouw opvolging.",
    ],
    faq: [
      {
        question: "Wat is een AI-assistent voor bedrijven?",
        answer:
          "Een AI-assistent voor bedrijven is een gespreksassistent op je website die vragen beantwoordt op basis van jouw bedrijfsinformatie en bezoekers kan begeleiden naar een aanvraag of afspraak.",
      },
      {
        question: "Wat kan een AI-assistent voor mijn bedrijf doen?",
        answer:
          "Een AI-assistent kan veelgestelde vragen beantwoorden, bezoekers gericht doorvragen, commerciële interesse herkennen en doorgeven als lead.",
      },
      {
        question: "Kan een AI-assistent leads kwalificeren?",
        answer: "Ja. De assistent herkent commerciële signalen in het gesprek en geeft die door als gekwalificeerde lead.",
      },
      {
        question: "Kan een AI-assistent afspraken maken?",
        answer:
          "Dat kan wanneer de gekozen agenda- en afsprakenworkflow daarvoor wordt ingericht. We bepalen vooraf wat de assistent wel en niet mag doen.",
      },
      {
        question: "Wat kost een AI-assistent?",
        answer: "Website + AI-assistent is een vanaf-pakket van €795, plus €49 per maand. De exacte prijs hangt af van de gekozen oplossing.",
      },
    ],
    primaryCta: { label: "Probeer de AI-assistent", href: "#live-ai" },
    secondaryCta: { label: "Plan een kennismaking", href: CONTACT_MAILTO },
    related: [
      { href: "/websites", label: "Websites die leads opleveren" },
      { href: "/leadautomatisering", label: "Leadautomatisering" },
    ],
  },
  {
    slug: "leadautomatisering",
    url: `${SITE_URL}/leadautomatisering`,
    serviceName: "AIVaults Flow",
    serviceType: "Leadautomatisering",
    title: "Leadautomatisering voor bedrijven | AIVaultsAI",
    description:
      "AIVaultsAI Flow automatiseert terugkerend werk achter je website: aanvragen opvangen, opvolgen en kwalificeren.",
    ogImage: OG_IMAGE,
    h1: "Leadautomatisering voor bedrijven",
    hero: "AIVaultsAI Flow automatiseert terugkerend werk achter je website: aanvragen, opvolging, e-mail, documenten en koppelingen met bestaande tools.",
    definition:
      "Leadautomatisering is het automatisch opvangen, opvolgen en kwalificeren van nieuwe aanvragen uit je website en formulieren, zodat geen lead verloren gaat.",
    capabilities: [
      { title: "Lead routing", detail: "Nieuwe aanvragen komen automatisch op de juiste plek terecht." },
      { title: "Automatische opvolging", detail: "Leads worden direct en consequent opgevolgd, zonder handmatig werk." },
      { title: "Procesautomatisering", detail: "Terugkerende stappen achter je website worden geautomatiseerd." },
      { title: "Tool-integraties", detail: "Koppelingen met bestaande tools die je al gebruikt." },
      { title: "Maatwerk workflows", detail: "Workflows die passen bij jouw specifieke proces." },
    ],
    audience: [
      "Bedrijven die veel aanvragen binnenkrijgen",
      "Bedrijven die leads nog handmatig opvolgen",
      "Bedrijven die meer uit hun website willen halen",
    ],
    howItWorks: [
      "Aanvragen uit je website en formulieren worden automatisch opgevangen.",
      "Leads worden gekwalificeerd op basis van commerciële signalen.",
      "Automatische opvolging start: e-mail, documenten en vervolgstappen.",
      "Koppelingen met bestaande tools houden je werkprocessen op orde.",
    ],
    faq: [
      {
        question: "Wat is leadautomatisering?",
        answer:
          "AIVaultsAI Flow automatiseert terugkerend werk achter je website: aanvragen, opvolging, e-mail, documenten en koppelingen met bestaande tools.",
      },
      {
        question: "Hoe werkt automatische leadkwalificatie?",
        answer:
          "De Flow herkent commerciële signalen in aanvragen en gesprekken en kwalificeert de lead op basis daarvan, zodat jij prioriteit kunt geven.",
      },
      {
        question: "Welke bedrijfsprocessen kan ik automatiseren?",
        answer: "Vooral terugkerend werk rond aanvragen: opvangen, opvolgen, e-mail, documenten en koppelingen met bestaande tools.",
      },
      {
        question: "Voor welke bedrijven is dit geschikt?",
        answer:
          "AIVaultsAI werkt voor bedrijven in onder meer bouw & installatie, lokale dienstverlening, advies & zakelijke dienstverlening en praktijken & afsprakenbedrijven.",
      },
    ],
    primaryCta: { label: "Laat zien wat je wilt automatiseren", href: "#live-ai" },
    secondaryCta: { label: "Plan een kennismaking", href: CONTACT_MAILTO },
    related: [
      { href: "/ai-assistenten", label: "AI-assistenten" },
      { href: "/websites", label: "Websites die leads opleveren" },
    ],
  },
  {
    slug: "websites",
    url: `${SITE_URL}/websites`,
    serviceName: "AIVaults Web",
    serviceType: "Websites",
    title: "Websites die leads opleveren | AIVaultsAI",
    description:
      "Snelle, professionele websites die bezoekers naar een duidelijke volgende stap sturen — mobiel-first en conversiegericht.",
    ogImage: OG_IMAGE,
    h1: "Websites die leads opleveren",
    hero: "AIVaultsAI bouwt snelle, professionele websites die bezoekers niet alleen informeren, maar naar een duidelijke volgende stap sturen.",
    definition:
      "Een conversiegerichte bedrijfswebsite is een website die bezoekers begeleidt van interesse naar een aanvraag, afspraak of contact.",
    capabilities: [
      { title: "Maatwerk design", detail: "Een website die past bij jouw merk en doelen." },
      { title: "Mobiel-first", detail: "Gebouwd voor de manier waarop bezoekers echt browsen." },
      { title: "SEO-basis", detail: "Een technische basis die zoekmachines kunnen begrijpen." },
      { title: "Conversiegerichte CTA's", detail: "Duidelijke volgende stappen op het juiste moment." },
      { title: "Hosting en SSL", detail: "Veilig en snel online, inclusief hosting en SSL." },
    ],
    audience: [
      "Bedrijven die een professionele digitale basis nodig hebben",
      "Bedrijven die meer aanvragen uit hun website willen",
      "Bedrijven die een bestaande website willen vernieuwen",
    ],
    howItWorks: [
      "We ontwerpen de website op basis van jouw doelen en klantreis.",
      "We bouwen mobiel-first met conversiegerichte CTA's.",
      "We testen en lanceren met hosting en SSL.",
      "We groeien verder met AI en automatisering wanneer dat past.",
    ],
    faq: [
      {
        question: "Moet ik al een website hebben?",
        answer: "Nee. We kunnen een nieuwe website bouwen of een bestaande website als startpunt gebruiken.",
      },
      {
        question: "Wat kost een website?",
        answer: "Een website is een vanaf-pakket van €495 eenmalig. De exacte prijs hangt af van de gekozen oplossing.",
      },
      {
        question: "Wat is inbegrepen?",
        answer:
          "Een maatwerk homepage, mobiel geoptimaliseerde pagina's, een SEO-ready structuur, een contact- of aanvraagformulier en één revisieronde.",
      },
      {
        question: "Hoe werkt het?",
        answer:
          "We starten met jouw doel, ontwerpen de oplossing, bouwen en testen, en groeien daarna verder met automatisering of AI wanneer dat past.",
      },
    ],
    primaryCta: { label: "Bekijk wat mogelijk is", href: "#live-ai" },
    secondaryCta: { label: "Plan een kennismaking", href: CONTACT_MAILTO },
    related: [
      { href: "/ai-assistenten", label: "AI-assistenten" },
      { href: "/leadautomatisering", label: "Leadautomatisering" },
    ],
  },
];

/** Truthful per-page Service schema (no offers, ratings or unproven fields). */
export function servicePageSchema(config: ServicePageConfig) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: config.serviceName,
    serviceType: config.serviceType,
    url: config.url,
    description: config.description,
    provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  } as const;
}
