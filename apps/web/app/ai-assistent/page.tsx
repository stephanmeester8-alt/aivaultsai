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
 * Product-JSON-LD ZONDER prijs/offers: de prijs is exclusief btw (geen
 * eenduidige schema.org-weergave) en prijzen in structured data driften.
 * Naam en beschrijving zijn verifieerbaar; meer wordt niet beweerd.
 * (Zelfde filosofie als SERVICES_SCHEMA in lib/site.ts.)
 */
const PRODUCT_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "AI-assistent + cursus + persoonlijke onboarding",
  description: HERO.lead,
  brand: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
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
