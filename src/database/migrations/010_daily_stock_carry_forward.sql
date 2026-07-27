-- Daily stock is an exact available balance for one product/date.
-- This migration removes the legacy published-total field without touching
-- historical daily balance rows.

ALTER TABLE daily_stocks
  DROP CONSTRAINT IF EXISTS daily_stocks_remaining_within_total,
  DROP CONSTRAINT IF EXISTS daily_stocks_total_quantity_non_negative,
  DROP COLUMN IF EXISTS total_quantity;

ALTER TABLE daily_stocks
  DROP CONSTRAINT IF EXISTS daily_stocks_quantity_non_negative,
  ADD CONSTRAINT daily_stocks_quantity_non_negative CHECK (quantity >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS daily_stocks_product_date_unique
  ON daily_stocks (product_id, stock_date);

CREATE INDEX IF NOT EXISTS daily_stocks_product_date_desc_index
  ON daily_stocks (product_id, stock_date DESC);

-- Rollback:
-- DROP INDEX IF EXISTS daily_stocks_product_date_desc_index;
-- The removed total_quantity column is intentionally not restored because it
-- did not represent a reliable stock balance after order approvals.
