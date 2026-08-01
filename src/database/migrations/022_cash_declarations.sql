-- Internal dealer cash acknowledgements.
-- These rows are intentionally isolated from Tally sync tables and never alter
-- an imported Tally receipt, invoice, ledger, or closing balance.

CREATE TABLE IF NOT EXISTS cash_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  cash_given_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  received_by UUID,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE cash_declarations
  ADD COLUMN IF NOT EXISTS dealer_id UUID,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS cash_given_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS note VARCHAR(500),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS received_by UUID,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_declarations_dealer_id_fkey'
  ) THEN
    ALTER TABLE cash_declarations
      ADD CONSTRAINT cash_declarations_dealer_id_fkey
      FOREIGN KEY (dealer_id) REFERENCES dealers(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_declarations_received_by_fkey'
  ) THEN
    ALTER TABLE cash_declarations
      ADD CONSTRAINT cash_declarations_received_by_fkey
      FOREIGN KEY (received_by) REFERENCES users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_declarations_amount_positive_check'
  ) THEN
    ALTER TABLE cash_declarations
      ADD CONSTRAINT cash_declarations_amount_positive_check
      CHECK (amount > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_declarations_status_check'
  ) THEN
    ALTER TABLE cash_declarations
      ADD CONSTRAINT cash_declarations_status_check
      CHECK (status IN ('PENDING', 'RECEIVED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cash_declarations_dealer_status_date_index
  ON cash_declarations (dealer_id, status, cash_given_at DESC);
CREATE INDEX IF NOT EXISTS cash_declarations_status_date_index
  ON cash_declarations (status, cash_given_at DESC);
CREATE INDEX IF NOT EXISTS cash_declarations_received_by_index
  ON cash_declarations (received_by) WHERE received_by IS NOT NULL;
