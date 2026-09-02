-- Agent Tool Platform — webshop (shop)
-- Apply after 008_tenant_tool_policies.sql (vereist pgcrypto uit 001).
-- Eén digitaal product vandaag (AI-assistent-pakket, €249 excl. btw);
-- de tabel is generiek voor toekomstige producten.
-- Orders: status komt ALLEEN uit de geverifieerde Stripe-webhook
-- (PENDING → PAID/CANCELLED); nooit vanuit een client-redirect.
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

CREATE TABLE IF NOT EXISTS shop_orders (
  order_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES shop_products(product_id),
  session_id        TEXT UNIQUE,          -- Stripe Checkout Session id (na checkout-start)
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','PAID','CANCELLED','FAILED')),
  customer_email    TEXT,
  quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents  INTEGER NOT NULL CHECK (unit_price_cents > 0),
  total_cents       INTEGER NOT NULL CHECK (total_cents > 0),
  currency          TEXT NOT NULL DEFAULT 'EUR',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_orders_status
  ON shop_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_orders_session
  ON shop_orders(session_id);

DROP TRIGGER IF EXISTS shop_products_set_updated_at ON shop_products;
CREATE TRIGGER shop_products_set_updated_at BEFORE UPDATE ON shop_products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS shop_orders_set_updated_at ON shop_orders;
CREATE TRIGGER shop_orders_set_updated_at BEFORE UPDATE ON shop_orders
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
