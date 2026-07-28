-- Run this after the initial two CREATE TABLE statements already executed in Neon.
-- It is idempotent and does not drop or recreate any existing data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE solar_projects
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE solar_project_media
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE solar_projects
  ADD COLUMN IF NOT EXISTS category VARCHAR(120) NOT NULL DEFAULT 'Solar installation',
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED';

ALTER TABLE solar_projects
  DROP CONSTRAINT IF EXISTS solar_projects_status_check;
ALTER TABLE solar_projects
  ADD CONSTRAINT solar_projects_status_check
  CHECK (status IN ('DRAFT', 'PUBLISHED'));

ALTER TABLE solar_project_media
  ADD COLUMN IF NOT EXISTS public_id VARCHAR(512),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- These tables were just created for this feature. Keep this guard explicit:
-- Cloudinary public IDs cannot be inferred from an arbitrary legacy URL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM solar_project_media WHERE public_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'solar_project_media contains existing rows without public_id. Supply each Cloudinary public_id before running this migration.';
  END IF;
END $$;

ALTER TABLE solar_project_media
  ALTER COLUMN public_id SET NOT NULL;

ALTER TABLE solar_project_media
  DROP CONSTRAINT IF EXISTS solar_project_media_type_check;
ALTER TABLE solar_project_media
  ADD CONSTRAINT solar_project_media_type_check
  CHECK (media_type IN ('IMAGE', 'VIDEO'));

CREATE INDEX IF NOT EXISTS solar_projects_location_idx
  ON solar_projects (location);
CREATE INDEX IF NOT EXISTS solar_projects_category_idx
  ON solar_projects (category);
CREATE INDEX IF NOT EXISTS solar_projects_completion_date_idx
  ON solar_projects (completion_date DESC);
CREATE INDEX IF NOT EXISTS solar_projects_published_created_idx
  ON solar_projects (status, created_at DESC);
CREATE INDEX IF NOT EXISTS solar_project_media_project_order_idx
  ON solar_project_media (project_id, display_order ASC);
