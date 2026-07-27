-- Forward-only review metadata for dealer orders.
-- Dealer remarks remain in orders.remarks; these columns keep administrator
-- notes and cancellation reasons distinct and visible to the dealer.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS admin_remarks VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Rollback:
-- ALTER TABLE orders
--   DROP COLUMN IF EXISTS reviewed_at,
--   DROP COLUMN IF EXISTS cancellation_reason,
--   DROP COLUMN IF EXISTS admin_remarks;
