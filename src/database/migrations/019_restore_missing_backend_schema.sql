-- Idempotent, non-destructive recovery migration for the current BETCO backend.
--
-- Run in the Neon SQL Editor after taking a database backup. It deliberately
-- creates missing objects only: it does not drop, delete, update, or overwrite
-- existing rows, tables, columns, constraints, indexes, or enum types.
--
-- A missing mandatory column on a populated legacy table cannot be reconstructed
-- from unavailable data. For those columns PostgreSQL will stop rather than
-- fabricate business data. All columns added by the existing forward migrations
-- have their production defaults below, so normal recovery is safe and repeatable.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- PostgreSQL enums used by TypeORM enum columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'user_role'
  ) THEN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'USER', 'STAFF');
  END IF;
END $$;

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'USER';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'STAFF';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'order_status'
  ) THEN
    CREATE TYPE order_status AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'PARTIALLY_FULFILLED',
      'CANCELLED',
      'BILLED',
      'COMPLETED'
    );
  END IF;
END $$;

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'PARTIALLY_FULFILLED';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'BILLED';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'COMPLETED';

-- Authentication and dealer profile data.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'USER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_phone_format CHECK (phone ~ '^[0-9]{10,15}$')
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NOT NULL,
  ADD COLUMN IF NOT EXISTS username VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500),
  image_url VARCHAR(2048),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_display_order_non_negative CHECK (display_order >= 0)
);

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS description VARCHAR(500),
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS name VARCHAR(120) NOT NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(100) NOT NULL,
  category_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(2000),
  image_url VARCHAR(2048),
  unit VARCHAR(20) NOT NULL DEFAULT 'PIECE',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_display_order_non_negative CHECK (display_order >= 0),
  CONSTRAINT products_unit_supported CHECK (unit IN ('PIECE', 'SET', 'BOX')),
  CONSTRAINT products_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku VARCHAR(100) NOT NULL,
  ADD COLUMN IF NOT EXISTS category_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS description VARCHAR(2000),
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) NOT NULL DEFAULT 'PIECE',
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  business_name VARCHAR(255) NOT NULL,
  shop_name VARCHAR(255),
  phone VARCHAR(32),
  contact_number VARCHAR(32),
  gstin VARCHAR(32),
  dealer_code VARCHAR(80),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dealers_user_id_unique UNIQUE (user_id),
  CONSTRAINT dealers_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)
);

ALTER TABLE dealers
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS business_name VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(32),
  ADD COLUMN IF NOT EXISTS contact_number VARCHAR(32),
  ADD COLUMN IF NOT EXISTS gstin VARCHAR(32),
  ADD COLUMN IF NOT EXISTS dealer_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Stock and dealer order workflow.
CREATE TABLE IF NOT EXISTS daily_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  stock_date DATE NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_stocks_quantity_non_negative CHECK (quantity >= 0),
  CONSTRAINT daily_stocks_product_date_unique UNIQUE (product_id, stock_date),
  CONSTRAINT daily_stocks_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id)
);

ALTER TABLE daily_stocks
  ADD COLUMN IF NOT EXISTS product_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS stock_date DATE NOT NULL,
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL,
  status order_status NOT NULL DEFAULT 'PENDING',
  remarks VARCHAR(1000),
  admin_remarks VARCHAR(1000),
  cancellation_reason VARCHAR(1000),
  reviewed_at TIMESTAMPTZ,
  bill_generated BOOLEAN NOT NULL DEFAULT FALSE,
  bill_generated_at TIMESTAMPTZ,
  bill_generated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id),
  CONSTRAINT orders_bill_generated_by_fkey
    FOREIGN KEY (bill_generated_by) REFERENCES users(id)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS dealer_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS status order_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS remarks VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS admin_remarks VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bill_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bill_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bill_generated_by UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INTEGER NOT NULL,
  approved_quantity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_items_order_product_unique UNIQUE (order_id, product_id),
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_approved_quantity_non_negative
    CHECK (approved_quantity IS NULL OR approved_quantity >= 0),
  CONSTRAINT order_items_approved_quantity_within_requested
    CHECK (approved_quantity IS NULL OR approved_quantity <= quantity),
  CONSTRAINT order_items_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id)
);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS order_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS product_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL,
  ADD COLUMN IF NOT EXISTS approved_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Staff billing notifications. Bills remain Tally-only; no invoice PDF is stored here.
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'ORDER_UPDATED',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS body TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'ORDER_UPDATED',
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Cloudinary-backed Solar Projects metadata. No binary media is stored in Neon.
CREATE TABLE IF NOT EXISTS solar_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  customer_name VARCHAR(255),
  location VARCHAR(255) NOT NULL,
  completion_date DATE NOT NULL,
  category VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT solar_projects_status_check CHECK (status IN ('DRAFT', 'PUBLISHED')),
  CONSTRAINT solar_projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)
);

ALTER TABLE solar_projects
  ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS description VARCHAR(2000) NOT NULL,
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS location VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS completion_date DATE NOT NULL,
  ADD COLUMN IF NOT EXISTS category VARCHAR(120) NOT NULL DEFAULT 'Solar installation',
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS created_by UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS solar_project_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  media_url VARCHAR(2048) NOT NULL,
  thumbnail_url VARCHAR(2048) NOT NULL,
  public_id VARCHAR(512) NOT NULL,
  media_type VARCHAR(10) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT solar_project_media_type_check CHECK (media_type IN ('IMAGE', 'VIDEO')),
  CONSTRAINT solar_project_media_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES solar_projects(id) ON DELETE CASCADE
);

ALTER TABLE solar_project_media
  ADD COLUMN IF NOT EXISTS project_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS media_url VARCHAR(2048) NOT NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(2048) NOT NULL,
  ADD COLUMN IF NOT EXISTS public_id VARCHAR(512) NOT NULL,
  ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) NOT NULL,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Read-only Tally synchronization data. This stores exported metadata only.
CREATE TABLE IF NOT EXISTS dealer_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(100) NOT NULL,
  tally_company_name VARCHAR(255) NOT NULL DEFAULT '',
  tally_voucher_guid VARCHAR(255) NOT NULL DEFAULT '',
  tally_master_id VARCHAR(100),
  tally_alter_id VARCHAR(100),
  voucher_type VARCHAR(80) NOT NULL DEFAULT 'Sales',
  party_ledger_name VARCHAR(255) NOT NULL DEFAULT '',
  dealer_id UUID NOT NULL,
  invoice_date DATE NOT NULL,
  invoice_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  pending_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dealer_invoices_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id)
);

ALTER TABLE dealer_invoices
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100) NOT NULL,
  ADD COLUMN IF NOT EXISTS tally_company_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tally_voucher_guid VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tally_master_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tally_alter_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS voucher_type VARCHAR(80) NOT NULL DEFAULT 'Sales',
  ADD COLUMN IF NOT EXISTS party_ledger_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dealer_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS invoice_date DATE NOT NULL,
  ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_metadata JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS dealer_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL,
  product_id UUID,
  item_name VARCHAR(255) NOT NULL DEFAULT '',
  sku VARCHAR(100),
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit VARCHAR(32),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dealer_invoice_items_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES dealer_invoices(id) ON DELETE CASCADE,
  CONSTRAINT dealer_invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id)
);

ALTER TABLE dealer_invoice_items
  ADD COLUMN IF NOT EXISTS invoice_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS product_id UUID,
  ADD COLUMN IF NOT EXISTS item_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sku VARCHAR(100),
  ADD COLUMN IF NOT EXISTS quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit VARCHAR(32),
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS dealer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL,
  payment_date DATE NOT NULL,
  reference_number VARCHAR(100),
  tally_company_name VARCHAR(255) NOT NULL DEFAULT '',
  tally_voucher_guid VARCHAR(255) NOT NULL DEFAULT '',
  tally_master_id VARCHAR(100),
  tally_alter_id VARCHAR(100),
  voucher_number VARCHAR(100),
  voucher_type VARCHAR(80) NOT NULL DEFAULT 'Receipt',
  party_ledger_name VARCHAR(255) NOT NULL DEFAULT '',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dealer_payments_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES dealers(id)
);

ALTER TABLE dealer_payments
  ADD COLUMN IF NOT EXISTS dealer_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS payment_date DATE NOT NULL,
  ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tally_company_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tally_voucher_guid VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tally_master_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tally_alter_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS voucher_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS voucher_type VARCHAR(80) NOT NULL DEFAULT 'Receipt',
  ADD COLUMN IF NOT EXISTS party_ledger_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source_metadata JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS dealer_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  allocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dealer_payment_allocations_unique UNIQUE (payment_id, invoice_id),
  CONSTRAINT dealer_payment_allocations_payment_id_fkey
    FOREIGN KEY (payment_id) REFERENCES dealer_payments(id) ON DELETE CASCADE,
  CONSTRAINT dealer_payment_allocations_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES dealer_invoices(id) ON DELETE CASCADE
);

ALTER TABLE dealer_payment_allocations
  ADD COLUMN IF NOT EXISTS payment_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS invoice_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS tally_dealer_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL,
  tally_company_name VARCHAR(255) NOT NULL,
  tally_ledger_guid VARCHAR(255),
  tally_ledger_name VARCHAR(255) NOT NULL,
  mapping_method VARCHAR(30) NOT NULL,
  last_closing_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tally_dealer_mappings_dealer_company_unique
    UNIQUE (dealer_id, tally_company_name),
  CONSTRAINT tally_dealer_mappings_dealer_id_fkey
    FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE CASCADE
);

ALTER TABLE tally_dealer_mappings
  ADD COLUMN IF NOT EXISTS dealer_id UUID NOT NULL,
  ADD COLUMN IF NOT EXISTS tally_company_name VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS tally_ledger_guid VARCHAR(255),
  ADD COLUMN IF NOT EXISTS tally_ledger_name VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS mapping_method VARCHAR(30) NOT NULL,
  ADD COLUMN IF NOT EXISTS last_closing_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

ALTER TABLE tally_sync_checkpoints
  ADD COLUMN IF NOT EXISTS connector_id VARCHAR(120) NOT NULL,
  ADD COLUMN IF NOT EXISTS tally_company_name VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS checkpoint_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_successful_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

ALTER TABLE tally_sync_runs
  ADD COLUMN IF NOT EXISTS connector_id VARCHAR(120) NOT NULL,
  ADD COLUMN IF NOT EXISTS tally_company_name VARCHAR(255) NOT NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ledger_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unmatched_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- BaseEntity primary keys. A newly restored ID column receives a UUID default;
-- an existing incomplete table with duplicate or NULL IDs will stop safely
-- instead of losing or rewriting any row.
ALTER TABLE users ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE categories ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE products ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE daily_stocks ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE solar_projects ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE solar_project_media ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE dealer_invoices ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE dealer_invoice_items ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE dealer_payments ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE dealer_payment_allocations ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE tally_dealer_mappings ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE tally_sync_checkpoints ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE tally_sync_runs ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'categories',
    'products',
    'dealers',
    'daily_stocks',
    'orders',
    'order_items',
    'notifications',
    'solar_projects',
    'solar_project_media',
    'dealer_invoices',
    'dealer_invoice_items',
    'dealer_payments',
    'dealer_payment_allocations',
    'tally_dealer_mappings',
    'tally_sync_checkpoints',
    'tally_sync_runs'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = format('public.%I', table_name)::regclass
        AND contype = 'p'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id)',
        table_name,
        table_name || '_pkey'
      );
    END IF;
  END LOOP;
END $$;

-- Missing relationship constraints. Named checks keep this script repeatable
-- without replacing a pre-existing constraint or changing existing records.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_format') THEN
    ALTER TABLE users ADD CONSTRAINT users_phone_format
      CHECK (phone ~ '^[0-9]{10,15}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_display_order_non_negative') THEN
    ALTER TABLE categories ADD CONSTRAINT categories_display_order_non_negative
      CHECK (display_order >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_display_order_non_negative') THEN
    ALTER TABLE products ADD CONSTRAINT products_display_order_non_negative
      CHECK (display_order >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_unit_supported') THEN
    ALTER TABLE products ADD CONSTRAINT products_unit_supported
      CHECK (unit IN ('PIECE', 'SET', 'BOX'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_stocks_quantity_non_negative') THEN
    ALTER TABLE daily_stocks ADD CONSTRAINT daily_stocks_quantity_non_negative
      CHECK (quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_positive') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_positive
      CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_approved_quantity_non_negative') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_approved_quantity_non_negative
      CHECK (approved_quantity IS NULL OR approved_quantity >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_approved_quantity_within_requested') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_approved_quantity_within_requested
      CHECK (approved_quantity IS NULL OR approved_quantity <= quantity);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solar_projects_status_check') THEN
    ALTER TABLE solar_projects ADD CONSTRAINT solar_projects_status_check
      CHECK (status IN ('DRAFT', 'PUBLISHED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solar_project_media_type_check') THEN
    ALTER TABLE solar_project_media ADD CONSTRAINT solar_project_media_type_check
      CHECK (media_type IN ('IMAGE', 'VIDEO'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_category_id_fkey') THEN
    ALTER TABLE products ADD CONSTRAINT products_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES categories(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealers_user_id_fkey') THEN
    ALTER TABLE dealers ADD CONSTRAINT dealers_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_stocks_product_id_fkey') THEN
    ALTER TABLE daily_stocks ADD CONSTRAINT daily_stocks_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_dealer_id_fkey') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_dealer_id_fkey
      FOREIGN KEY (dealer_id) REFERENCES dealers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_bill_generated_by_fkey') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_bill_generated_by_fkey
      FOREIGN KEY (bill_generated_by) REFERENCES users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_product_id_fkey') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_fkey') THEN
    ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solar_projects_created_by_fkey') THEN
    ALTER TABLE solar_projects ADD CONSTRAINT solar_projects_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solar_project_media_project_id_fkey') THEN
    ALTER TABLE solar_project_media ADD CONSTRAINT solar_project_media_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES solar_projects(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealer_invoices_dealer_id_fkey') THEN
    ALTER TABLE dealer_invoices ADD CONSTRAINT dealer_invoices_dealer_id_fkey
      FOREIGN KEY (dealer_id) REFERENCES dealers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealer_invoice_items_invoice_id_fkey') THEN
    ALTER TABLE dealer_invoice_items ADD CONSTRAINT dealer_invoice_items_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES dealer_invoices(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealer_invoice_items_product_id_fkey') THEN
    ALTER TABLE dealer_invoice_items ADD CONSTRAINT dealer_invoice_items_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealer_payments_dealer_id_fkey') THEN
    ALTER TABLE dealer_payments ADD CONSTRAINT dealer_payments_dealer_id_fkey
      FOREIGN KEY (dealer_id) REFERENCES dealers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealer_payment_allocations_payment_id_fkey') THEN
    ALTER TABLE dealer_payment_allocations ADD CONSTRAINT dealer_payment_allocations_payment_id_fkey
      FOREIGN KEY (payment_id) REFERENCES dealer_payments(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dealer_payment_allocations_invoice_id_fkey') THEN
    ALTER TABLE dealer_payment_allocations ADD CONSTRAINT dealer_payment_allocations_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES dealer_invoices(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tally_dealer_mappings_dealer_id_fkey') THEN
    ALTER TABLE tally_dealer_mappings ADD CONSTRAINT tally_dealer_mappings_dealer_id_fkey
      FOREIGN KEY (dealer_id) REFERENCES dealers(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Unique constraints represented as indexes in the production migrations.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
  ON users (LOWER(BTRIM(username)));
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique ON users (phone);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(TRIM(email))) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_unique
  ON categories (LOWER(BTRIM(name)));
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_lower_unique
  ON products (LOWER(BTRIM(sku)));
CREATE UNIQUE INDEX IF NOT EXISTS dealers_dealer_code_unique
  ON dealers (dealer_code) WHERE dealer_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS daily_stocks_product_date_unique
  ON daily_stocks (product_id, stock_date);
CREATE UNIQUE INDEX IF NOT EXISTS order_items_order_product_unique
  ON order_items (order_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS dealer_invoices_tally_source_unique
  ON dealer_invoices (tally_company_name, tally_voucher_guid)
  WHERE tally_voucher_guid <> '';
CREATE UNIQUE INDEX IF NOT EXISTS dealer_payments_tally_source_unique
  ON dealer_payments (tally_company_name, tally_voucher_guid)
  WHERE tally_voucher_guid <> '';
CREATE UNIQUE INDEX IF NOT EXISTS tally_dealer_mappings_company_ledger_guid_unique
  ON tally_dealer_mappings (tally_company_name, tally_ledger_guid)
  WHERE tally_ledger_guid IS NOT NULL;

-- Query indexes used by catalogue, profile, dashboard, order, notification,
-- Solar Gallery, Tally billing, and Tally sync repository queries.
CREATE INDEX IF NOT EXISTS categories_active_display_order_index
  ON categories (is_active, display_order, name);
CREATE INDEX IF NOT EXISTS products_active_name_index
  ON products (is_active, name);
CREATE INDEX IF NOT EXISTS products_category_active_display_order_index
  ON products (category_id, is_active, display_order, name);
CREATE INDEX IF NOT EXISTS dealers_contact_number_index
  ON dealers (contact_number) WHERE contact_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS dealers_gstin_index
  ON dealers (UPPER(gstin)) WHERE gstin IS NOT NULL;
CREATE INDEX IF NOT EXISTS daily_stocks_date_product_index
  ON daily_stocks (stock_date, product_id);
CREATE INDEX IF NOT EXISTS daily_stocks_product_date_desc_index
  ON daily_stocks (product_id, stock_date DESC);
CREATE INDEX IF NOT EXISTS orders_dealer_created_index
  ON orders (dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_index
  ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_dealer_status_created_index
  ON orders (dealer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_billing_queue_index
  ON orders (status, created_at DESC)
  WHERE status IN ('APPROVED', 'PARTIALLY_FULFILLED');
CREATE INDEX IF NOT EXISTS orders_bill_generated_by_index
  ON orders (bill_generated_by) WHERE bill_generated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_items_order_index ON order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_index ON order_items (product_id);
CREATE INDEX IF NOT EXISTS notifications_user_created_index
  ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS solar_projects_location_idx ON solar_projects (location);
CREATE INDEX IF NOT EXISTS solar_projects_category_idx ON solar_projects (category);
CREATE INDEX IF NOT EXISTS solar_projects_completion_date_idx
  ON solar_projects (completion_date DESC);
CREATE INDEX IF NOT EXISTS solar_projects_published_created_idx
  ON solar_projects (status, created_at DESC);
CREATE INDEX IF NOT EXISTS solar_projects_created_by_idx ON solar_projects (created_by);
CREATE INDEX IF NOT EXISTS solar_project_media_project_order_idx
  ON solar_project_media (project_id, display_order ASC);
CREATE INDEX IF NOT EXISTS dealer_invoices_dealer_date_index
  ON dealer_invoices (dealer_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS dealer_invoice_items_invoice_order_index
  ON dealer_invoice_items (invoice_id, display_order);
CREATE INDEX IF NOT EXISTS dealer_invoice_items_product_index
  ON dealer_invoice_items (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dealer_payments_dealer_date_index
  ON dealer_payments (dealer_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS dealer_payment_allocations_invoice_index
  ON dealer_payment_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS tally_dealer_mappings_ledger_name_index
  ON tally_dealer_mappings (tally_company_name, LOWER(tally_ledger_name));
CREATE INDEX IF NOT EXISTS tally_sync_runs_connector_started_index
  ON tally_sync_runs (connector_id, started_at DESC);
CREATE INDEX IF NOT EXISTS tally_sync_runs_company_started_index
  ON tally_sync_runs (tally_company_name, started_at DESC);
