-- Run this after 002_create_product_catalog.sql in the Neon SQL Editor.
-- It creates dealer profiles, daily stock, and the dealer order-history tables.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  business_name VARCHAR(255) NOT NULL,
  phone VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  stock_date DATE NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_stocks_product_date_unique UNIQUE (product_id, stock_date)
);

DO $$
BEGIN
  CREATE TYPE order_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'PARTIALLY_FULFILLED',
    'CANCELLED',
    'COMPLETED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id),
  status order_status NOT NULL DEFAULT 'PENDING',
  remarks VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_dealer_created_index
  ON orders (dealer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  approved_quantity INTEGER CHECK (approved_quantity IS NULL OR approved_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_items_order_index ON order_items (order_id);

-- Keep daily_stock empty until the administrator updates stock for today.
-- Products without a positive quantity display “Yet to come” in the app.
-- Example daily update:
-- INSERT INTO daily_stocks (product_id, stock_date, quantity)
-- VALUES ('<product-id>', CURRENT_DATE, 20)
-- ON CONFLICT (product_id, stock_date)
-- DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();
