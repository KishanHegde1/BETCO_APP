-- Google Play account-deletion request audit trail.
-- Apply this in Neon SQL Editor after migration 030 and before deploying the
-- public /account-deletion page.
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_identifier VARCHAR(255) NOT NULL,
  contact VARCHAR(255) NOT NULL,
  details VARCHAR(1000),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT account_deletion_requests_status_check
    CHECK (status IN ('PENDING', 'IN_REVIEW', 'COMPLETED', 'DECLINED'))
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_status_created_at_index
  ON account_deletion_requests (status, created_at DESC);
