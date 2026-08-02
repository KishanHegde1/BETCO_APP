-- Optional Cloudinary payment/cash proof screenshot for internal cash records.
-- The screenshot is never stored in NeonDB and is never sent to Tally.

ALTER TABLE cash_declarations
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_public_id VARCHAR,
  ADD COLUMN IF NOT EXISTS payment_proof_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS cash_declarations_payment_proof_expiry_index
  ON cash_declarations (payment_proof_expires_at)
  WHERE payment_proof_url IS NOT NULL;
