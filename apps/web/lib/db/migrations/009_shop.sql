-- Agent Tool Platform — webshop catalogus (shop)
-- Apply after 008_tenant_tool_policies.sql (vereist pgcrypto uit 001).
-- Fase 1: catalogus + productselectie (géén orders/betalingen).
-- Payments zijn BEWUST buiten scope; een order-/payment-laag volgt later
-- achter een abstracte PaymentProvider-interface.
--
-- Let op: in eerdere omgevingen is een shop_orders-tabel aangemaakt (fase
-- Stripe). Die is hier verwijderd uit de migratie; bestaande databases
-- bevatten de ongebruikte tabel nog tot een expliciete opschoon-migratie.
--
-- Idempotent en non-destructief: geen DROP, geen reset, geen deletes.

CREATE TABLE IF NOT EXISTS shop_products (
  product_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  price_cents    INTEGER NOT NULL CHECK (price_cents > 0),
  currency       TEXT NOT NULL DEFAULT 'EUR',
  tax_note       TEXT NOT NULL DEFAULT '',
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_products_active
  ON shop_products(active);

DROP TRIGGER IF EXISTS shop_products_set_updated_at ON shop_products;
CREATE TRIGGER shop_products_set_updated_at BEFORE UPDATE ON shop_products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed: het enige product vandaag (idempotent).
INSERT INTO shop_products (slug, name, description, price_cents, currency, tax_note)
VALUES (
  'ai-assistent-pakket',
  'AI-assistent + cursus + persoonlijke onboarding',
  'Je AI-assistent, de complete praktische cursus (8 hoofdstukken met opdrachten en prompts) en 1 uur persoonlijke onboarding. Eenmalige aankoop.',
  24900,
  'EUR',
  'excl. btw'
)
ON CONFLICT (slug) DO NOTHING;
