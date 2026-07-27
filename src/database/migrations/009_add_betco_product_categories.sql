-- Add the standard Betco catalogue categories.
-- Run this after migrations 001 through 008 in the Neon SQL Editor.
-- The statement is safe to run more than once and keeps the categories active.

INSERT INTO categories (
  name,
  description,
  display_order,
  is_active
)
VALUES
  ('Battery', 'Battery products', 10, TRUE),
  ('UPS / Inverter', 'UPS and inverter products', 20, TRUE),
  ('Solar Battery', 'Solar battery products', 30, TRUE),
  ('Solar Inverter', 'Solar inverter products', 40, TRUE),
  ('Solar Panel', 'Solar panel products', 50, TRUE),
  ('HKVA Inverters', 'High-kVA inverter products', 60, TRUE)
ON CONFLICT (LOWER(BTRIM(name)))
DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  is_active = TRUE,
  updated_at = NOW();
