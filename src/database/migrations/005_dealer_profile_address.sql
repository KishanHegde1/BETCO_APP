-- Dealer profile extension. This migration can run independently.
-- Existing shop and contact fields are reused from dealers.business_name and
-- dealers.phone. This migration only adds the missing address field.

ALTER TABLE dealers
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Rollback:
-- ALTER TABLE dealers DROP COLUMN IF EXISTS address;
