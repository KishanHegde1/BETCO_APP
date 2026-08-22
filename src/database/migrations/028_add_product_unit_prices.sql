-- Internal stock reference price for every catalogue product.
-- Safe for existing databases: existing products start at 0.00 until an
-- administrator enters the correct price from the Product catalogue screen.

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_unit_price_non_negative;

ALTER TABLE products
  ADD CONSTRAINT products_unit_price_non_negative
  CHECK (unit_price >= 0 AND unit_price <= 9999999999.99);

COMMIT;
