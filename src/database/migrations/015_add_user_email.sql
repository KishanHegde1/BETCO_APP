-- Optional contact email for dealer management. Existing accounts are retained.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(TRIM(email)))
  WHERE email IS NOT NULL;

