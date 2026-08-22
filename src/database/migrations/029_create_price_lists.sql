-- Historical supplier price lists. The currently active list is the sole
-- source for stock valuation; product.unit_price remains a separate master
-- field and is never overwritten by this import.

BEGIN;

CREATE TABLE IF NOT EXISTS price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  supplier VARCHAR(255),
  effective_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT price_lists_name_not_blank CHECK (LENGTH(BTRIM(name)) > 0)
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL
    REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id UUID NULL REFERENCES products(id) ON DELETE SET NULL,
  model_name VARCHAR(255) NOT NULL,
  normalized_model_name VARCHAR(255) NOT NULL,
  net_effective_price NUMERIC(12, 2),
  gst_rate NUMERIC(6, 3),
  gst_amount NUMERIC(12, 2),
  gst_included_price NUMERIC(12, 2) NOT NULL,
  mrp NUMERIC(12, 2),
  match_status VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT price_list_items_model_not_blank
    CHECK (LENGTH(BTRIM(model_name)) > 0),
  CONSTRAINT price_list_items_normalized_model_not_blank
    CHECK (LENGTH(BTRIM(normalized_model_name)) > 0),
  CONSTRAINT price_list_items_match_status_check
    CHECK (match_status IN ('MATCHED', 'UNMATCHED')),
  CONSTRAINT price_list_items_gst_included_price_check
    CHECK (gst_included_price >= 0 AND gst_included_price <= 9999999999.99),
  CONSTRAINT price_list_items_non_negative_money_check
    CHECK (
      (net_effective_price IS NULL OR net_effective_price >= 0)
      AND (gst_amount IS NULL OR gst_amount >= 0)
      AND (mrp IS NULL OR mrp >= 0)
      AND (gst_rate IS NULL OR gst_rate >= 0)
    ),
  CONSTRAINT price_list_items_unique_model
    UNIQUE (price_list_id, normalized_model_name)
);

-- Betco has one company context, so exactly one price list may be active.
CREATE UNIQUE INDEX IF NOT EXISTS price_lists_one_active_unique
  ON price_lists (is_active)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS price_lists_active_effective_index
  ON price_lists (is_active, effective_date DESC);
CREATE INDEX IF NOT EXISTS price_lists_created_by_index
  ON price_lists (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS price_list_items_price_list_index
  ON price_list_items (price_list_id);
CREATE INDEX IF NOT EXISTS price_list_items_product_index
  ON price_list_items (product_id);
CREATE INDEX IF NOT EXISTS price_list_items_model_index
  ON price_list_items (normalized_model_name);
CREATE UNIQUE INDEX IF NOT EXISTS price_list_items_price_list_product_unique
  ON price_list_items (price_list_id, product_id)
  WHERE product_id IS NOT NULL;

COMMIT;
