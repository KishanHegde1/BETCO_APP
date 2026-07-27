-- Forward-only performance indexes for the administrator dealer workspace.
-- Existing migration 003 already creates orders(dealer_id, created_at DESC),
-- order_items(order_id), and a unique dealers(user_id) index.

CREATE INDEX IF NOT EXISTS orders_dealer_status_created_index
  ON orders (dealer_id, status, created_at DESC);

-- Rollback:
-- DROP INDEX IF EXISTS orders_dealer_status_created_index;
