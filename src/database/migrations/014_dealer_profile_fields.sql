-- Run after 013 in the Neon SQL Editor. Existing business_name and phone
-- values are retained and used to backfill the explicit profile fields.

ALTER TABLE dealers
  ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS contact_number VARCHAR(32);

UPDATE dealers
SET
  shop_name = COALESCE(shop_name, business_name),
  contact_number = COALESCE(contact_number, phone)
WHERE shop_name IS NULL OR contact_number IS NULL;

CREATE INDEX IF NOT EXISTS dealers_contact_number_index
  ON dealers (contact_number)
  WHERE contact_number IS NOT NULL;
