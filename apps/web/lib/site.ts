export const SITE_NAME = "AIVaultsAI";
export const SITE_URL = "https://www.aivaultsai.one";
export const SITE_DOMAIN = "aivaultsai.one";

export const CONTACT_EMAIL = "aivaultsai@gmail.com";
export const LINKEDIN_URL =
  "https://www.linkedin.com/in/stephan-meester-758566374/";

export const SITE_TITLE =
  "AIVaultsAI — Websites, AI-assistenten en leadautomatisering";

export const SITE_DESCRIPTION =
  "AIVaultsAI bouwt websites, AI-assistenten en automatiseringen die bedrijven helpen bezoekers op te vangen, leads te kwalificeren en werk slimmer te organiseren.";

export const NAV = [
  { href: "/websites", label: "Websites" },
  { href: "/ai-assistenten", label: "AI-assistenten" },
  { href: "/ai-assistent", label: "Assistent + cursus" },
  { href: "/leadautomatisering", label: "Automatisering" },
  { href: "/#pricing", label: "Aanbod" },
  { href: "/#faq", label: "FAQ" },
] as const;

export const FOOTER_LINKS = [
  { href: "/websites", label: "Websites" },
  { href: "/ai-assistenten", label: "AI-assistenten" },
  { href: "/ai-assistent", label: "Assistent + cursus" },
  { href: "/leadautomatisering", label: "Leadautomatisering" },
  { href: "/#pricing", label: "Aanbod" },
  { href: "/#faq", label: "FAQ" },
  { href: "/#contact", label: "Contact" },
] as const;

/**
 * Truthful JSON-LD (TASK 7).
 *
 * Only properties verifiable from this repository are included: name and
 * url (lib/site.ts). No logo (no provable official logo asset — only a
 * favicon/icon mark exists), no telephone, address, founder, review,
 * rating, sameAs or other unproven properties.
 */
export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
} as const;

/**
 * WebSite JSON-LD (TASK 7). No SearchAction: the site has no search
 * function.
 */
export const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
} as const;

/**
 * Service catalog JSON-LD (TASK 9).
 *
 * Names and descriptions match the solutions shown on the page
 * (components/commercial-home.tsx): AIVaults Web / AIVaults AI /
 * AIVaults Flow. No prices (drift risk), no ratings, no SKUs.
 */
export const SERVICES_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Diensten van AIVaultsAI",
  itemListElement: [
    {
      "@type": "Service",
      position: 1,
      name: "AIVaults Web",
      serviceType: "Websites",
      description:
        "Snelle, professionele websites die bezoekers naar een duidelijke volgende stap sturen.",
      provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
    {
      "@type": "Service",
      position: 2,
      name: "AIVaults AI",
      serviceType: "AI-assistenten",
      description:
        "AI-assistenten die bezoekers te woord staan, vragen beantwoorden en leads opvangen.",
      provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
    {
      "@type": "Service",
      position: 3,
      name: "AIVaults Flow",
      serviceType: "Leadautomatisering",
      description:
        "Automatiseer terugkerend werk achter je website: aanvragen, opvolging, e-mail, documenten en koppelingen met bestaande tools.",
      provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
  ],
} as const;
