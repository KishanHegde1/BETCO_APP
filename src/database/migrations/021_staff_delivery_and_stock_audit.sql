-- Delivery tracking, immutable order timelines, and staff stock additions.
-- Safe to run repeatedly in Neon. No existing business data is removed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(30) NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipped_by UUID,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by UUID;

-- Billed legacy orders are ready to dispatch; all other records retain their
-- safe NOT_READY default and cannot be shipped accidentally.
UPDATE orders
SET delivery_status = 'READY_FOR_DISPATCH'
WHERE status = 'BILLED'
  AND delivery_status = 'NOT_READY';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_status_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_delivery_status_check
      CHECK (delivery_status IN ('NOT_READY', 'READY_FOR_DISPATCH', 'SHIPPED', 'RECEIVED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_shipped_by_fkey') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_shipped_by_fkey
      FOREIGN KEY (shipped_by) REFERENCES users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_received_by_fkey') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_received_by_fkey
      FOREIGN KEY (received_by) REFERENCES users(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS order_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  stock_date DATE NOT NULL,
  movement_type VARCHAR(50) NOT NULL,
  quantity_change INTEGER NOT NULL CHECK (quantity_change > 0),
  previous_quantity INTEGER NOT NULL CHECK (previous_quantity >= 0),
  new_quantity INTEGER NOT NULL CHECK (new_quantity >= previous_quantity),
  performed_by UUID NOT NULL REFERENCES users(id),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS order_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_order_id_fkey') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_dealer_delivery_created_index
  ON orders (dealer_id, delivery_status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_dispatch_queue_index
  ON orders (delivery_status, bill_generated_at DESC)
  WHERE delivery_status IN ('READY_FOR_DISPATCH', 'SHIPPED');
CREATE INDEX IF NOT EXISTS orders_recently_received_index
  ON orders (received_at DESC)
  WHERE delivery_status = 'RECEIVED';
CREATE INDEX IF NOT EXISTS order_activities_order_created_index
  ON order_activities (order_id, created_at ASC);
CREATE INDEX IF NOT EXISTS notifications_order_created_index
  ON notifications (order_id, created_at DESC)
  WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_product_date_index
  ON stock_movements (product_id, stock_date DESC);
CREATE INDEX IF NOT EXISTS stock_movements_performed_by_created_index
  ON stock_movements (performed_by, created_at DESC);
