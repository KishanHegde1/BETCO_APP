-- PM Surya Ghar customer applications and private PDF metadata.
-- PDF bytes remain in authenticated Cloudinary storage, never in NeonDB.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pm_surya_ghar_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(15) NOT NULL,
  alternate_phone VARCHAR(15),
  email VARCHAR(255),
  address_line_1 VARCHAR(500) NOT NULL,
  address_line_2 VARCHAR(500),
  city VARCHAR(120) NOT NULL,
  district VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL,
  pincode VARCHAR(6) NOT NULL,
  electricity_consumer_number VARCHAR(100),
  electricity_provider VARCHAR(255),
  sanctioned_load_kw NUMERIC(8, 2),
  notes VARCHAR(2000),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pm_surya_ghar_customer_phone_check
    CHECK (customer_phone ~ '^[0-9]{10,15}$'),
  CONSTRAINT pm_surya_ghar_alternate_phone_check
    CHECK (
      alternate_phone IS NULL
      OR alternate_phone ~ '^[0-9]{10,15}$'
    ),
  CONSTRAINT pm_surya_ghar_pincode_check
    CHECK (pincode ~ '^[0-9]{6}$'),
  CONSTRAINT pm_surya_ghar_sanctioned_load_check
    CHECK (
      sanctioned_load_kw IS NULL
      OR sanctioned_load_kw BETWEEN 0.01 AND 999999.99
    ),
  CONSTRAINT pm_surya_ghar_status_check
    CHECK (status IN ('DRAFT', 'READY'))
);

CREATE INDEX IF NOT EXISTS pm_surya_ghar_applications_owner_status_index
  ON pm_surya_ghar_applications (created_by, status);
CREATE INDEX IF NOT EXISTS pm_surya_ghar_applications_owner_updated_index
  ON pm_surya_ghar_applications (created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS pm_surya_ghar_applications_phone_index
  ON pm_surya_ghar_applications (customer_phone);
CREATE INDEX IF NOT EXISTS pm_surya_ghar_applications_status_updated_index
  ON pm_surya_ghar_applications (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS pm_surya_ghar_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL
    REFERENCES pm_surya_ghar_applications(id) ON DELETE CASCADE,
  document_type VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  file_size_bytes INTEGER NOT NULL,
  page_count SMALLINT NOT NULL,
  storage_public_id VARCHAR(512) NOT NULL UNIQUE,
  storage_format VARCHAR(20) NOT NULL DEFAULT 'pdf',
  sha256 CHAR(64) NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pm_surya_ghar_document_type_check
    CHECK (
      document_type IN (
        'IDENTITY_PROOF',
        'ADDRESS_PROOF',
        'ELECTRICITY_BILL',
        'PROPERTY_PROOF',
        'SITE_PHOTO',
        'OTHER'
      )
    ),
  CONSTRAINT pm_surya_ghar_document_mime_check
    CHECK (mime_type = 'application/pdf'),
  CONSTRAINT pm_surya_ghar_document_size_check
    CHECK (file_size_bytes BETWEEN 1 AND 20971520),
  CONSTRAINT pm_surya_ghar_document_pages_check
    CHECK (page_count BETWEEN 1 AND 30),
  CONSTRAINT pm_surya_ghar_document_sha256_check
    CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS pm_surya_ghar_documents_application_date_index
  ON pm_surya_ghar_documents (application_id, created_at ASC);
CREATE INDEX IF NOT EXISTS pm_surya_ghar_documents_uploaded_by_index
  ON pm_surya_ghar_documents (uploaded_by);
CREATE UNIQUE INDEX IF NOT EXISTS pm_surya_ghar_documents_application_sha256_unique
  ON pm_surya_ghar_documents (application_id, sha256);
