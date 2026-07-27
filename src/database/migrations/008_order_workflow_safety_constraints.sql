-- Forward-only safety migration for the existing order workflow.
-- Run after 007. It does not alter the existing order_status enum or data.
-- The preflight intentionally stops before any schema change if legacy data
-- violates the new rules, so invalid rows are never silently changed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM order_items
    WHERE quantity <= 0
       OR approved_quantity < 0
       OR approved_quantity > quantity
  ) THEN
    RAISE EXCEPTION
      'Cannot add order-item safety constraints: existing quantity or approved_quantity values are invalid.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM daily_stocks
    WHERE quantity < 0
  ) THEN
    RAISE EXCEPTION
      'Cannot add daily-stock safety constraint: an existing quantity is negative.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM order_items
    GROUP BY order_id, product_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add the unique order-item index: duplicate order_id/product_id pairs exist.';
  END IF;
END $$;

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_quantity_positive,
  ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  DROP CONSTRAINT IF EXISTS order_items_approved_quantity_non_negative,
  ADD CONSTRAINT order_items_approved_quantity_non_negative
    CHECK (approved_quantity IS NULL OR approved_quantity >= 0),
  DROP CONSTRAINT IF EXISTS order_items_approved_quantity_within_requested,
  ADD CONSTRAINT order_items_approved_quantity_within_requested
    CHECK (approved_quantity IS NULL OR approved_quantity <= quantity);

ALTER TABLE daily_stocks
  DROP CONSTRAINT IF EXISTS daily_stocks_quantity_non_negative,
  ADD CONSTRAINT daily_stocks_quantity_non_negative CHECK (quantity >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_product_unique
  ON order_items (order_id, product_id);

-- Rollback:
-- DROP INDEX IF EXISTS order_items_order_product_unique;
-- ALTER TABLE daily_stocks
--   DROP CONSTRAINT IF EXISTS daily_stocks_quantity_non_negative;
-- ALTER TABLE order_items
--   DROP CONSTRAINT IF EXISTS order_items_approved_quantity_within_requested,
--   DROP CONSTRAINT IF EXISTS order_items_approved_quantity_non_negative,
--   DROP CONSTRAINT IF EXISTS order_items_quantity_positive;
