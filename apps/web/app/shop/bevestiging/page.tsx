import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/container";
import { sql } from "@/lib/db/client";
import { getOrderBySessionId } from "@/lib/shop/orders";
import { formatPriceCents } from "@/lib/shop/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bestelling | AIVaultsAI",
  robots: { index: false, follow: false }, // bevestigingspagina's zijn privé per klant
};

type PageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

/**
 * Bevestigingspagina. Belangrijk: de status komt ALTIJD uit de database
 * (via de geverifieerde webhook), nooit uit een client-parameter — een
 * redirect naar deze pagina bewijst op zichzelf geen betaling.
 */
export default async function ShopConfirmationPage({ searchParams }: PageProps) {
  const { session_id: sessionId } = await searchParams;

  let order = null;
  let error = false;
  if (sessionId && typeof sessionId === "string" && sessionId.length > 0) {
    try {
      order = await getOrderBySessionId(sql, sessionId);
    } catch (cause) {
      error = true;
      console.error("[shop] order lookup failed:", cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section className="border-b border-line py-16 sm:py-24" aria-labelledby="order-status">
      <Container className="max-w-3xl">
        <p className="font-mono text-[11px] tracking-[0.2em] text-gold uppercase">Webshop · AIVaultsAI</p>

        {error ? (
          <>
            <h1 id="order-status" className="mt-5 text-3xl font-medium tracking-tight text-ink">
              Even geduld
            </h1>
            <p className="mt-4 text-base leading-relaxed text-mute">
              Je bestelling kon niet worden opgehaald. Probeer het zo meteen opnieuw, of neem contact op.
            </p>
          </>
        ) : order === null ? (
          <>
            <h1 id="order-status" className="mt-5 text-3xl font-medium tracking-tight text-ink">
              Geen bestelling gevonden
            </h1>
            <p className="mt-4 text-base leading-relaxed text-mute">
              We konden geen bestelling bij dit nummer vinden. Heb je zojuist betaald? Check dan straks nog
              eens, of neem contact op.
            </p>
            <Link href="/shop" className="mt-6 inline-block text-sm text-mute no-underline hover:text-ink">
              ← Terug naar de webshop
            </Link>
          </>
        ) : order.status === "PAID" ? (
          <>
            <h1 id="order-status" className="mt-5 text-3xl font-medium tracking-tight text-ink">
              Bedankt — je betaling is ontvangen
            </h1>
            <p className="mt-4 text-base leading-relaxed text-mute">
              Je bestelling is betaald (
              {formatPriceCents(order.totalCents, order.currency)}
              {order.quantity > 1 ? ` × ${order.quantity}` : ""}). Je ontvangt je toegang tot het pakket en
              we plannen je uur persoonlijke onboarding — de bevestiging komt per e-mail.
            </p>
            <Link href="/ai-assistent" className="mt-6 inline-block text-sm text-mute no-underline hover:text-ink">
              ← Bekijk wat je met je pakket kunt doen
            </Link>
          </>
        ) : order.status === "PENDING" ? (
          <>
            <h1 id="order-status" className="mt-5 text-3xl font-medium tracking-tight text-ink">
              We verwerken je betaling nog
            </h1>
            <p className="mt-4 text-base leading-relaxed text-mute">
              Je bestelling is nog niet bevestigd. Dit kan even duren. Je ontvangt vanzelf een bevestiging
              zodra de betaling is verwerkt.
            </p>
          </>
        ) : (
          <>
            <h1 id="order-status" className="mt-5 text-3xl font-medium tracking-tight text-ink">
              Betaling niet afgerond
            </h1>
            <p className="mt-4 text-base leading-relaxed text-mute">
              Je bestelling is niet afgerond. Geen zorgen: er is niets in rekening gebracht.
            </p>
            <Link href="/shop" className="mt-6 inline-block text-sm text-mute no-underline hover:text-ink">
              ← Terug naar de webshop
            </Link>
          </>
        )}
      </Container>
    </section>
  );
}
