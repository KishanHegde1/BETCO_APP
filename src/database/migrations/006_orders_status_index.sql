-- Supports paginated ADMIN order filtering without changing existing order data.

CREATE INDEX IF NOT EXISTS orders_status_created_index
  ON orders (status, created_at DESC);

-- Rollback:
-- DROP INDEX IF EXISTS orders_status_created_index;
