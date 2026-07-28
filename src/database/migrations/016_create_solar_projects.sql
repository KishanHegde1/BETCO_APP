CREATE TABLE IF NOT EXISTS solar_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  customer_name VARCHAR(255),
  location VARCHAR(255) NOT NULL,
  completion_date DATE NOT NULL,
  category VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT solar_projects_status_check
    CHECK (status IN ('DRAFT', 'PUBLISHED'))
);

CREATE INDEX IF NOT EXISTS solar_projects_location_idx
  ON solar_projects (location);
CREATE INDEX IF NOT EXISTS solar_projects_category_idx
  ON solar_projects (category);
CREATE INDEX IF NOT EXISTS solar_projects_completion_date_idx
  ON solar_projects (completion_date DESC);
CREATE INDEX IF NOT EXISTS solar_projects_published_created_idx
  ON solar_projects (status, created_at DESC);

CREATE TABLE IF NOT EXISTS solar_project_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES solar_projects(id) ON DELETE CASCADE,
  media_url VARCHAR(2048) NOT NULL,
  thumbnail_url VARCHAR(2048) NOT NULL,
  public_id VARCHAR(512) NOT NULL,
  media_type VARCHAR(10) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT solar_project_media_type_check
    CHECK (media_type IN ('IMAGE', 'VIDEO'))
);

CREATE INDEX IF NOT EXISTS solar_project_media_project_order_idx
  ON solar_project_media (project_id, display_order ASC);
