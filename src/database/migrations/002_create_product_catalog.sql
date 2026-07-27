-- Run this after 001_create_auth_users.sql in the Neon SQL Editor.
-- The Flutter app reads active products through GET /v1/products.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_name_unique ON categories (name);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(100) NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id),
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON products (sku);
CREATE INDEX IF NOT EXISTS products_active_name_index
  ON products (is_active, name);

-- Leave the catalogue empty for now. When you are ready, add a category first
-- and use its id in the product row. Example:
-- INSERT INTO categories (name, description)
-- VALUES ('Batteries', 'Battery catalogue')
-- RETURNING id;
--
-- INSERT INTO products (sku, category_id, name)
-- VALUES ('BAT-001', '<category-id-from-above>', 'Example Battery');
