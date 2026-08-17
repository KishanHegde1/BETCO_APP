BEGIN;

CREATE TABLE IF NOT EXISTS pm_surya_ghar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL
    REFERENCES pm_surya_ghar_applications(id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  brand VARCHAR(255),
  physical_serial_number VARCHAR(255),
  unit VARCHAR(20) NOT NULL,
  quantity NUMERIC(9, 3) NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  line_total NUMERIC(19, 2) NOT NULL
    GENERATED ALWAYS AS (ROUND(quantity * unit_price, 2)) STORED,
  display_order INTEGER NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT pm_surya_ghar_items_item_name_check
    CHECK (length(btrim(item_name)) BETWEEN 1 AND 255),

  CONSTRAINT pm_surya_ghar_items_brand_check
    CHECK (brand IS NULL OR length(btrim(brand)) BETWEEN 1 AND 255),

  CONSTRAINT pm_surya_ghar_items_serial_check
    CHECK (
      physical_serial_number IS NULL
      OR length(btrim(physical_serial_number)) BETWEEN 1 AND 255
    ),

  CONSTRAINT pm_surya_ghar_items_unit_check
    CHECK (
      unit IN (
        'PIECE',
        'METER',
        'FOOT',
        'KILOGRAM',
        'LITER',
        'BOX',
        'SET',
        'ROLL',
        'OTHER'
      )
    ),

  CONSTRAINT pm_surya_ghar_items_quantity_check
    CHECK (quantity > 0),

  CONSTRAINT pm_surya_ghar_items_unit_price_check
    CHECK (unit_price >= 0),

  CONSTRAINT pm_surya_ghar_items_display_order_check
    CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS pm_surya_ghar_items_application_order_index
  ON pm_surya_ghar_items (application_id, display_order, created_at);

CREATE INDEX IF NOT EXISTS pm_surya_ghar_items_created_by_index
  ON pm_surya_ghar_items (created_by);

CREATE UNIQUE INDEX IF NOT EXISTS pm_surya_ghar_items_application_serial_unique
  ON pm_surya_ghar_items (application_id, lower(physical_serial_number))
  WHERE physical_serial_number IS NOT NULL;

COMMIT;
