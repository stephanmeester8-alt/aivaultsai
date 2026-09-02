import type { Metadata } from "next";

import { JsonLd } from "@/components/seo/json-ld";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { AssistantComparison } from "@/components/ai-assistant/assistant-comparison";
import { AssistantCourse } from "@/components/ai-assistant/assistant-course";
import { AssistantCta } from "@/components/ai-assistant/assistant-cta";
import { AssistantFaq } from "@/components/ai-assistant/assistant-faq";
import { AssistantHero } from "@/components/ai-assistant/assistant-hero";
import { AssistantOnboarding } from "@/components/ai-assistant/assistant-onboarding";
import { AssistantPackage } from "@/components/ai-assistant/assistant-package";
import { AssistantProblem } from "@/components/ai-assistant/assistant-problem";
import { AssistantValue } from "@/components/ai-assistant/assistant-value";
import { FAQ, HERO } from "@/components/ai-assistant/assistant-offer-data";

export const metadata: Metadata = {
  title: "AI-assistent + cursus + persoonlijke onboarding (€249) | AIVaultsAI",
  description:
    "AI-assistent, complete praktische cursus en 1 uur persoonlijke onboarding — €249 eenmalig, excl. btw. Je krijgt niet alleen de assistent: je leert hem ook optimaal inzetten.",
  alternates: { canonical: "/ai-assistent" },
  openGraph: {
    title: "AI-assistent + cursus + onboarding — €249 excl. btw | AIVaultsAI",
    description:
      "De assistent is het gereedschap. De cursus en de onboarding zijn het vakmanschap. Eén pakket, €249 eenmalig.",
    url: `${SITE_URL}/ai-assistent`,
    siteName: SITE_NAME,
    locale: "nl_NL",
    type: "website",
  },
};

/**
 * Product-JSON-LD met één correcte Offer (vereist door Google Product
 * rich results): €249,00 eenmalig, EUR, InStock. Geen review of
 * aggregateRating (er bestaan geen beoordelingen — geen fakes). Geen
 * priceValidUntil (geen geldige einddatum: het aanbod is doorlopend).
 * De prijs op de pagina is exclusief btw; schema.org Offer heeft geen
 * eenduidig excl-btw-veld, dus price = 249.00 zoals het aanbod luidt.
 */
const PRODUCT_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "AI-assistent + cursus + persoonlijke onboarding",
  description: HERO.lead,
  brand: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  offers: {
    "@type": "Offer",
    url: `${SITE_URL}/ai-assistent`,
    price: "249.00",
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
    seller: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  },
} as const;

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.items.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
} as const;

export default function Page() {
  return (
    <>
      <JsonLd data={PRODUCT_SCHEMA} />
      <JsonLd data={FAQ_SCHEMA} />
      <AssistantHero />
      <AssistantProblem />
      <AssistantPackage />
      <AssistantCourse />
      <AssistantOnboarding />
      <AssistantComparison />
      <AssistantValue />
      <AssistantFaq />
      <AssistantCta />
    </>
  );
}
