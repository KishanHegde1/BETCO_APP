-- Forward-only production migration. Run after 003_create_order_booking_tables.sql.
-- It preserves existing rows: the old daily_stocks.quantity remains the remaining
-- quantity, while total_quantity records the original quantity published for the day.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS description VARCHAR(2000),
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) NOT NULL DEFAULT 'PIECE',
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE daily_stocks
  ADD COLUMN IF NOT EXISTS total_quantity INTEGER;

UPDATE daily_stocks
SET total_quantity = quantity
WHERE total_quantity IS NULL;

ALTER TABLE daily_stocks
  ALTER COLUMN total_quantity SET DEFAULT 0,
  ALTER COLUMN total_quantity SET NOT NULL;

ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_display_order_non_negative,
  ADD CONSTRAINT categories_display_order_non_negative CHECK (display_order >= 0);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_display_order_non_negative,
  ADD CONSTRAINT products_display_order_non_negative CHECK (display_order >= 0),
  DROP CONSTRAINT IF EXISTS products_unit_supported,
  ADD CONSTRAINT products_unit_supported CHECK (unit IN ('PIECE', 'SET', 'BOX'));

ALTER TABLE daily_stocks
  DROP CONSTRAINT IF EXISTS daily_stocks_total_quantity_non_negative,
  ADD CONSTRAINT daily_stocks_total_quantity_non_negative CHECK (total_quantity >= 0),
  DROP CONSTRAINT IF EXISTS daily_stocks_remaining_within_total,
  ADD CONSTRAINT daily_stocks_remaining_within_total CHECK (quantity >= 0 AND quantity <= total_quantity);

-- Replace case-sensitive unique indexes with case-insensitive indexes. Existing
-- duplicate data that differs only by case must be corrected before this migration.
DROP INDEX IF EXISTS categories_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_unique
  ON categories (LOWER(BTRIM(name)));

DROP INDEX IF EXISTS products_sku_unique;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_lower_unique
  ON products (LOWER(BTRIM(sku)));

CREATE INDEX IF NOT EXISTS categories_active_display_order_index
  ON categories (is_active, display_order, name);
CREATE INDEX IF NOT EXISTS products_category_active_display_order_index
  ON products (category_id, is_active, display_order, name);
CREATE INDEX IF NOT EXISTS daily_stocks_date_product_index
  ON daily_stocks (stock_date, product_id);
CREATE INDEX IF NOT EXISTS order_items_product_index
  ON order_items (product_id);

-- Manual rollback (only use after checking that no application code depends on
-- these fields and indexes):
-- DROP INDEX IF EXISTS order_items_product_index;
-- DROP INDEX IF EXISTS daily_stocks_date_product_index;
-- DROP INDEX IF EXISTS products_category_active_display_order_index;
-- DROP INDEX IF EXISTS categories_active_display_order_index;
-- DROP INDEX IF EXISTS products_sku_lower_unique;
-- CREATE UNIQUE INDEX products_sku_unique ON products (sku);
-- DROP INDEX IF EXISTS categories_name_lower_unique;
-- CREATE UNIQUE INDEX categories_name_unique ON categories (name);
-- ALTER TABLE daily_stocks DROP CONSTRAINT IF EXISTS daily_stocks_remaining_within_total;
-- ALTER TABLE daily_stocks DROP CONSTRAINT IF EXISTS daily_stocks_total_quantity_non_negative;
-- ALTER TABLE daily_stocks DROP COLUMN IF EXISTS total_quantity;
-- ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_supported;
-- ALTER TABLE products DROP CONSTRAINT IF EXISTS products_display_order_non_negative;
-- ALTER TABLE products DROP COLUMN IF EXISTS display_order, DROP COLUMN IF EXISTS unit,
--   DROP COLUMN IF EXISTS image_url, DROP COLUMN IF EXISTS description;
-- ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_display_order_non_negative;
-- ALTER TABLE categories DROP COLUMN IF EXISTS is_active, DROP COLUMN IF EXISTS display_order,
--   DROP COLUMN IF EXISTS image_url;
