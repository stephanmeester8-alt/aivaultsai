import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/container";
import { sql } from "@/lib/db/client";
import { getActiveProductBySlug } from "@/lib/shop/products";
import { formatPriceCents } from "@/lib/shop/format";
import { checkoutProductAction } from "@/lib/shop/actions";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string }>;
};

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

export default async function ShopProductPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { checkout } = await searchParams;
  const product = await loadProduct(slug);
  if (!product) notFound();

  const checkoutError =
    checkout === "mislukt" ? "De betaling kon niet worden gestart. Probeer het opnieuw." :
    checkout === "niet-geconfigureerd" ? "De webshop is nog niet volledig ingericht. Neem contact op via de website." :
    null;

  return (
    <>
      <section className="border-b border-line py-16 sm:py-20" aria-labelledby="product-title">
        <Container className="max-w-4xl">
          <p className="font-mono text-[11px] tracking-[0.2em] text-gold uppercase">
            Webshop · AIVaultsAI
          </p>
          <h1 id="product-title" className="mt-5 text-3xl font-medium tracking-tight text-ink sm:text-4xl lg:text-5xl">
            {product.name}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-mute sm:text-lg">{product.description}</p>

          <div className="mt-8 border border-gold/40 bg-panel p-6">
            <p className="font-mono text-3xl text-gold">
              {formatPriceCents(product.priceCents, product.currency)}
              {product.taxNote ? <span className="ml-2 text-sm text-mute">{product.taxNote}</span> : null}
            </p>
            <p className="mt-1 text-sm text-mute">Eenmalige aankoop · geen abonnement</p>
            <form action={checkoutProductAction} className="mt-6">
              <input type="hidden" name="slug" value={product.slug} />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-sm bg-ink px-6 py-3 text-sm font-medium text-canvas no-underline hover:bg-gold"
              >
                Koop nu — {formatPriceCents(product.priceCents, product.currency)}
                {product.taxNote ? ` ${product.taxNote}` : ""} →
              </button>
              <p className="mt-3 text-xs leading-relaxed text-faint">
                Beveiligde betaling via Stripe Checkout. Na betaling ontvang je je toegang en plannen we je
                onboarding.
              </p>
            </form>
            {checkoutError ? (
              <p role="alert" className="mt-4 border border-line bg-canvas p-4 text-sm text-ink">
                {checkoutError}
              </p>
            ) : null}
          </div>

          <div className="mt-8">
            <Link href="/ai-assistent" className="text-sm text-mute no-underline hover:text-ink">
              ← Bekijk het volledige pakket (assistent, cursus en onboarding)
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
