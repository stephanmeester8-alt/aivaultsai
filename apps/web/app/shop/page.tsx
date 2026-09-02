import type { Metadata } from "next";

import { Container } from "@/components/container";
import { ProductCard } from "@/components/shop/product-card";
import { sql } from "@/lib/db/client";
import { listActiveProducts } from "@/lib/shop/products";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Webshop | AIVaultsAI",
  description:
    "Bestel het AI-assistent-pakket: AI-assistent, complete praktische cursus en 1 uur persoonlijke onboarding. €249 eenmalig, excl. btw.",
};

export default async function ShopPage() {
  let products: Awaited<ReturnType<typeof listActiveProducts>> = [];
  let error = false;
  try {
    products = await listActiveProducts(sql);
  } catch (cause) {
    error = true;
    console.error("[shop] product listing failed:", cause instanceof Error ? cause.message : String(cause));
  }

  return (
    <>
      <section className="border-b border-line" aria-labelledby="shop-hero">
        <Container className="py-16 sm:py-20">
          <p className="font-mono text-[11px] tracking-[0.2em] text-gold uppercase">Webshop · AIVaultsAI</p>
          <h1 id="shop-hero" className="mt-5 max-w-3xl text-4xl font-medium tracking-tight text-ink sm:text-5xl">
            Producten
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-mute sm:text-lg">
            Eén pakket, één prijs. Geen abonnement, geen verrassingen.
          </p>
        </Container>
      </section>

      <section className="border-b border-line py-16 sm:py-20" aria-labelledby="shop-products">
        <Container>
          {error ? (
            <div role="alert" className="border border-line bg-panel p-6">
              <h2 className="text-lg font-medium text-ink">De webshop is tijdelijk niet beschikbaar</h2>
              <p className="mt-2 text-sm leading-relaxed text-mute">
                De producten konden niet worden geladen. Probeer het later opnieuw.
              </p>
            </div>
          ) : products.length === 0 ? (
            <div className="border border-line bg-panel p-6">
              <h2 className="text-lg font-medium text-ink">Nog geen producten</h2>
              <p className="mt-2 text-sm leading-relaxed text-mute">
                Er staan op dit moment geen producten in de webshop.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.productId} product={product} />
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
