-- Read-only Tally synchronization. This migration stores only data exported
-- from TallyPrime; it does not grant the backend any ability to alter Tally.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE dealers
  ADD COLUMN IF NOT EXISTS gstin VARCHAR(32),
  ADD COLUMN IF NOT EXISTS dealer_code VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS dealers_dealer_code_unique
  ON dealers (dealer_code)
  WHERE dealer_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS dealers_gstin_index
  ON dealers (UPPER(gstin))
  WHERE gstin IS NOT NULL;

CREATE TABLE IF NOT EXISTS dealer_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(100) NOT NULL,
  dealer_id UUID NOT NULL REFERENCES dealers(id),
  invoice_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dealer_invoices
  ADD COLUMN IF NOT EXISTS tally_company_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tally_voucher_guid VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tally_master_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tally_alter_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS voucher_type VARCHAR(80) NOT NULL DEFAULT 'Sales',
  ADD COLUMN IF NOT EXISTS party_ledger_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_metadata JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS dealer_invoices_tally_source_unique
  ON dealer_invoices (tally_company_name, tally_voucher_guid)
  WHERE tally_voucher_guid <> '';
CREATE INDEX IF NOT EXISTS dealer_invoices_dealer_date_index
  ON dealer_invoices (dealer_id, invoice_date DESC);

CREATE TABLE IF NOT EXISTS dealer_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES dealer_invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dealer_invoice_items
  ALTER COLUMN quantity TYPE NUMERIC(14,3) USING quantity::NUMERIC,
  ADD COLUMN IF NOT EXISTS item_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sku VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit VARCHAR(32),
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS dealer_invoice_items_invoice_order_index
  ON dealer_invoice_items (invoice_id, display_order);

CREATE TABLE IF NOT EXISTS dealer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id),
  payment_date DATE NOT NULL,
  reference_number VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dealer_payments
  ADD COLUMN IF NOT EXISTS tally_company_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tally_voucher_guid VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tally_master_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tally_alter_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS voucher_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS voucher_type VARCHAR(80) NOT NULL DEFAULT 'Receipt',
  ADD COLUMN IF NOT EXISTS party_ledger_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_metadata JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS dealer_payments_tally_source_unique
  ON dealer_payments (tally_company_name, tally_voucher_guid)
  WHERE tally_voucher_guid <> '';
CREATE INDEX IF NOT EXISTS dealer_payments_dealer_date_index
  ON dealer_payments (dealer_id, payment_date DESC);

CREATE TABLE IF NOT EXISTS dealer_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES dealer_payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES dealer_invoices(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dealer_payment_allocations_unique UNIQUE (payment_id, invoice_id)
);
ALTER TABLE dealer_payment_allocations
  ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS tally_dealer_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  tally_company_name VARCHAR(255) NOT NULL,
  tally_ledger_guid VARCHAR(255),
  tally_ledger_name VARCHAR(255) NOT NULL,
  mapping_method VARCHAR(30) NOT NULL,
  last_closing_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tally_dealer_mappings_dealer_company_unique
    UNIQUE (dealer_id, tally_company_name)
);
CREATE UNIQUE INDEX IF NOT EXISTS tally_dealer_mappings_company_ledger_guid_unique
  ON tally_dealer_mappings (tally_company_name, tally_ledger_guid)
  WHERE tally_ledger_guid IS NOT NULL;
CREATE INDEX IF NOT EXISTS tally_dealer_mappings_ledger_name_index
  ON tally_dealer_mappings (tally_company_name, LOWER(tally_ledger_name));

CREATE TABLE IF NOT EXISTS tally_sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id VARCHAR(120) NOT NULL,
  tally_company_name VARCHAR(255) NOT NULL,
  checkpoint_token VARCHAR(255),
  last_successful_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tally_sync_checkpoints_connector_company_unique
    UNIQUE (connector_id, tally_company_name)
);

CREATE TABLE IF NOT EXISTS tally_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id VARCHAR(120) NOT NULL,
  tally_company_name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  ledger_count INTEGER NOT NULL DEFAULT 0,
  invoice_count INTEGER NOT NULL DEFAULT 0,
  payment_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tally_sync_runs_company_started_index
  ON tally_sync_runs (tally_company_name, started_at DESC);
