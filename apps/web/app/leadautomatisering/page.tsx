import type { Metadata } from "next";

import { CommercialServicePage } from "@/components/commercial-service-page";
import { SERVICE_PAGES, servicePageSchema } from "@/lib/service-pages";

const config = SERVICE_PAGES.find((page) => page.slug === "leadautomatisering")!;

export const metadata: Metadata = {
  title: config.title,
  description: config.description,
  alternates: { canonical: `/${config.slug}` },
  openGraph: {
    title: config.title,
    description: config.description,
    url: config.url,
    siteName: "AIVaultsAI",
    locale: "nl_NL",
    type: "website",
    images: [{ url: config.ogImage }],
  },
};

export default function Page() {
  return <CommercialServicePage config={config} schema={servicePageSchema(config)} />;
}
