-- Compatibility migration for catalogue tables created before 002's
-- is_active column existed. Safe to run on an already-upgraded database.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS products_active_name_index
  ON products (is_active, name);

-- Rollback:
-- DROP INDEX IF EXISTS products_active_name_index;
-- ALTER TABLE products DROP COLUMN IF EXISTS is_active;
