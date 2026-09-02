import Link from "next/link";

import type { ShopProduct } from "@/lib/shop/types";
import { formatPriceCents } from "@/lib/shop/format";

/** Productkaart voor het shop-overzicht (server component). */
export function ProductCard({ product }: { product: ShopProduct }) {
  return (
    <article className="flex flex-col border border-line bg-panel p-6">
      <h2 className="text-lg font-medium text-ink">{product.name}</h2>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-mute">{product.description}</p>
      <p className="mt-5 font-mono text-xl text-gold">
        {formatPriceCents(product.priceCents, product.currency)}
        {product.taxNote ? <span className="ml-1 text-xs text-mute">{product.taxNote}</span> : null}
      </p>
      <Link
        href={`/shop/${product.slug}`}
        className="mt-5 inline-flex items-center justify-center rounded-sm bg-ink px-4 py-3 text-sm font-medium text-canvas no-underline hover:bg-gold"
      >
        Bekijk product →
      </Link>
    </article>
  );
}
