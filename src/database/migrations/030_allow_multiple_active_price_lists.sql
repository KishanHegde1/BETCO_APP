-- More than one supplier Price List can remain active. When active lists have
-- a price for the same model, Daily Stock uses the one with the latest
-- effective date (then latest creation time if the dates are identical).
BEGIN;

DROP INDEX IF EXISTS price_lists_one_active_unique;

CREATE INDEX IF NOT EXISTS price_lists_active_latest_index
  ON price_lists (effective_date DESC, created_at DESC)
  WHERE is_active = TRUE;

COMMIT;
