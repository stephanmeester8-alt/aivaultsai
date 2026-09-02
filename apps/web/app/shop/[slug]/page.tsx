import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/container";
import { sql } from "@/lib/db/client";
import { getActiveProductBySlug } from "@/lib/shop/products";
import { formatPriceCents } from "@/lib/shop/format";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const CONTACT_MAILTO =
  "https://mail.google.com/mail/?view=cm&fs=1&to=aivaultsai@gmail.com&su=Vraag%20over%20het%20AI-assistent-pakket";

async function loadProduct(slug: string) {
  try {
    return await getActiveProductBySlug(sql, slug);
  } catch (cause) {
    console.error("[shop] product load failed:", cause instanceof Error ? cause.message : String(cause));
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return { title: "Product niet gevonden | AIVaultsAI" };
  return {
    title: `${product.name} | AIVaultsAI`,
    description: product.description.slice(0, 160),
    alternates: { canonical: `/shop/${product.slug}` },
    openGraph: {
      title: `${product.name} | AIVaultsAI`,
      description: product.description.slice(0, 160),
      url: `${SITE_URL}/shop/${product.slug}`,
      siteName: "AIVaultsAI",
      locale: "nl_NL",
      type: "website",
    },
  };
}

/**
 * Productdetail (fase 1: catalogus). Geen checkout: betalingen zijn bewust
 * buiten scope. De CTA is een eerlijk contactpad — geen nep-buy-now-flow.
 */
export default async function ShopProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) notFound();

  return (
    <section className="border-b border-line py-16 sm:py-20" aria-labelledby="product-title">
      <Container className="max-w-4xl">
        <p className="font-mono text-[11px] tracking-[0.2em] text-gold uppercase">
          Webshop · AIVaultsAI
        </p>
        <h1
          id="product-title"
          className="mt-5 text-3xl font-medium tracking-tight text-ink sm:text-4xl lg:text-5xl"
        >
          {product.name}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-mute sm:text-lg">
          {product.description}
        </p>

        <div className="mt-8 border border-gold/40 bg-panel p-6">
          <p className="font-mono text-3xl text-gold">
            {formatPriceCents(product.priceCents, product.currency)}
            {product.taxNote ? <span className="ml-2 text-sm text-mute">{product.taxNote}</span> : null}
          </p>
          <p className="mt-1 text-sm text-mute">Eenmalige aankoop · geen abonnement</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={CONTACT_MAILTO}
              className="inline-flex items-center justify-center rounded-sm bg-ink px-6 py-3 text-sm font-medium text-canvas no-underline hover:bg-gold"
            >
              Vraag dit pakket aan →
            </a>
            <Link
              href="/ai-assistent"
              className="inline-flex items-center justify-center rounded-sm border border-line px-6 py-3 text-sm font-medium text-ink no-underline hover:border-gold/60"
            >
              Bekijk het volledige aanbod
            </Link>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-faint">
            Bestellen en betalen is binnenkort mogelijk. Vragen of reserveren? Neem gerust contact op.
          </p>
        </div>

        <div className="mt-8">
          <Link href="/shop" className="text-sm text-mute no-underline hover:text-ink">
            ← Terug naar de webshop
          </Link>
        </div>
      </Container>
    </section>
  );
}
