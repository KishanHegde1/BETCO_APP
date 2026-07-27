-- Run after migration 012 in the Neon SQL Editor before deploying this release.
-- This records a staff confirmation that a bill was created manually in Tally.
-- It deliberately does not create an invoice, price, payment, or PDF record.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'STAFF';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'BILLED';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bill_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bill_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bill_generated_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_bill_generated_by_fkey'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_bill_generated_by_fkey
      FOREIGN KEY (bill_generated_by) REFERENCES users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_billing_queue_index
  ON orders (status, created_at DESC)
  WHERE status IN ('APPROVED', 'PARTIALLY_FULFILLED');
CREATE INDEX IF NOT EXISTS orders_bill_generated_by_index
  ON orders (bill_generated_by)
  WHERE bill_generated_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'ORDER_UPDATED',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'ORDER_UPDATED';

CREATE INDEX IF NOT EXISTS notifications_user_created_index
  ON notifications (user_id, created_at DESC);
