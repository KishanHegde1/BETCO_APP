-- Read-only Tally ledger, bill, payment, mapping, and sync-audit expansion.
-- This migration never communicates with Tally and never removes accounting rows.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tally_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tally_company_name VARCHAR(255) NOT NULL,
  source_key VARCHAR(512) NOT NULL,
  tally_ledger_guid VARCHAR(255),
  tally_ledger_name VARCHAR(255) NOT NULL,
  normalized_ledger_name VARCHAR(255) NOT NULL,
  parent_group VARCHAR(255),
  phone VARCHAR(32),
  email VARCHAR(255),
  gstin VARCHAR(32),
  address TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  dealer_id UUID REFERENCES dealers(id) ON DELETE SET NULL,
  mapping_status VARCHAR(20) NOT NULL DEFAULT 'UNMAPPED',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tally_ledgers_company_source_key_unique
    UNIQUE (tally_company_name, source_key),
  CONSTRAINT tally_ledgers_mapping_status_check
    CHECK (mapping_status IN ('MAPPED', 'UNMAPPED'))
);

ALTER TABLE dealer_invoices
  ADD COLUMN IF NOT EXISTS source_key VARCHAR(512),
  ADD COLUMN IF NOT EXISTS normalized_party_ledger_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS narration TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS tally_ledger_id UUID REFERENCES tally_ledgers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_status VARCHAR(20) NOT NULL DEFAULT 'NOT_AVAILABLE',
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

-- Recover stable external keys for records written by the original Tally sync.
UPDATE dealer_invoices
SET source_key = COALESCE(
  NULLIF(source_metadata ->> 'sourceKey', ''),
  NULLIF(tally_voucher_guid, ''),
  'legacy-invoice:' || md5(
    COALESCE(tally_company_name, '') || '|' ||
    COALESCE(invoice_number, '') || '|' ||
    COALESCE(invoice_date::TEXT, '') || '|' ||
    COALESCE(party_ledger_name, '')
  )
)
WHERE source_key IS NULL OR BTRIM(source_key) = '';

UPDATE dealer_invoices
SET normalized_party_ledger_name = LOWER(
  BTRIM(REGEXP_REPLACE(REPLACE(COALESCE(party_ledger_name, ''), CHR(160), ' '), '\\s+', ' ', 'g'))
)
WHERE normalized_party_ledger_name IS NULL OR BTRIM(normalized_party_ledger_name) = '';

ALTER TABLE dealer_invoices
  ALTER COLUMN source_key SET NOT NULL,
  ALTER COLUMN normalized_party_ledger_name SET NOT NULL,
  ALTER COLUMN dealer_id DROP NOT NULL;

ALTER TABLE dealer_payments
  ADD COLUMN IF NOT EXISTS source_key VARCHAR(512),
  ADD COLUMN IF NOT EXISTS normalized_party_ledger_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(80),
  ADD COLUMN IF NOT EXISTS narration TEXT,
  ADD COLUMN IF NOT EXISTS tally_ledger_id UUID REFERENCES tally_ledgers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;

UPDATE dealer_payments
SET source_key = COALESCE(
  NULLIF(source_metadata ->> 'sourceKey', ''),
  NULLIF(tally_voucher_guid, ''),
  'legacy-payment:' || md5(
    COALESCE(tally_company_name, '') || '|' ||
    COALESCE(voucher_number, '') || '|' ||
    COALESCE(payment_date::TEXT, '') || '|' ||
    COALESCE(party_ledger_name, '')
  )
)
WHERE source_key IS NULL OR BTRIM(source_key) = '';

UPDATE dealer_payments
SET normalized_party_ledger_name = LOWER(
  BTRIM(REGEXP_REPLACE(REPLACE(COALESCE(party_ledger_name, ''), CHR(160), ' '), '\\s+', ' ', 'g'))
)
WHERE normalized_party_ledger_name IS NULL OR BTRIM(normalized_party_ledger_name) = '';

ALTER TABLE dealer_payments
  ALTER COLUMN source_key SET NOT NULL,
  ALTER COLUMN normalized_party_ledger_name SET NOT NULL,
  ALTER COLUMN dealer_id DROP NOT NULL;

ALTER TABLE tally_dealer_mappings
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE tally_sync_runs
  ADD COLUMN IF NOT EXISTS mapped_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ledger_inserted_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ledger_updated_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_inserted_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_updated_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_inserted_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_updated_count INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS dealer_invoices_tally_source_key_unique
  ON dealer_invoices (tally_company_name, source_key);
CREATE UNIQUE INDEX IF NOT EXISTS dealer_payments_tally_source_key_unique
  ON dealer_payments (tally_company_name, source_key);
CREATE INDEX IF NOT EXISTS tally_ledgers_normalized_name_index
  ON tally_ledgers (normalized_ledger_name);
CREATE INDEX IF NOT EXISTS tally_ledgers_dealer_index
  ON tally_ledgers (dealer_id) WHERE dealer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tally_ledgers_gstin_index
  ON tally_ledgers (UPPER(gstin)) WHERE gstin IS NOT NULL;
CREATE INDEX IF NOT EXISTS tally_ledgers_phone_index
  ON tally_ledgers (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS tally_ledgers_mapping_status_index
  ON tally_ledgers (mapping_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS dealer_invoices_dealer_date_index_v2
  ON dealer_invoices (dealer_id, invoice_date DESC) WHERE dealer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dealer_invoices_invoice_date_index
  ON dealer_invoices (invoice_date DESC);
CREATE INDEX IF NOT EXISTS dealer_invoices_voucher_number_index
  ON dealer_invoices (invoice_number);
CREATE INDEX IF NOT EXISTS dealer_invoices_payment_status_index
  ON dealer_invoices (payment_status);
CREATE INDEX IF NOT EXISTS dealer_invoices_normalized_party_index
  ON dealer_invoices (normalized_party_ledger_name);
CREATE INDEX IF NOT EXISTS dealer_payments_dealer_date_index_v2
  ON dealer_payments (dealer_id, payment_date DESC) WHERE dealer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dealer_payments_voucher_number_index
  ON dealer_payments (voucher_number);
CREATE INDEX IF NOT EXISTS dealer_payments_normalized_party_index
  ON dealer_payments (normalized_party_ledger_name);
CREATE INDEX IF NOT EXISTS tally_mappings_active_company_name_index
  ON tally_dealer_mappings (tally_company_name, is_active, LOWER(BTRIM(tally_ledger_name)));
