-- Make administrator-created PM Surya Ghar applications visible to staff.
-- Shared administrator records remain read-only for staff at the API layer.

BEGIN;

ALTER TABLE pm_surya_ghar_applications
  ADD COLUMN IF NOT EXISTS staff_visible BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE pm_surya_ghar_applications AS application
SET staff_visible = TRUE
FROM users AS creator
WHERE creator.id = application.created_by
  AND creator.role::text = 'ADMIN'
  AND application.staff_visible IS DISTINCT FROM TRUE;

CREATE INDEX IF NOT EXISTS pm_surya_ghar_applications_staff_visible_updated_index
  ON pm_surya_ghar_applications (updated_at DESC)
  WHERE staff_visible = TRUE;

COMMIT;
