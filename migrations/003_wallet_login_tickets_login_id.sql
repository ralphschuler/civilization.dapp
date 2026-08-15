ALTER TABLE wallet_login_tickets ADD COLUMN IF NOT EXISTS login_id uuid;
-- Preserve legacy tickets: ticket_hash deterministically supplies a valid UUID
-- without requiring a PostgreSQL extension before enforcing the new invariant.
UPDATE wallet_login_tickets
SET login_id = (
  substr(md5(ticket_hash), 1, 8) || '-' ||
  substr(md5(ticket_hash), 9, 4) || '-' ||
  '5' || substr(md5(ticket_hash), 14, 3) || '-' ||
  '8' || substr(md5(ticket_hash), 18, 3) || '-' ||
  substr(md5(ticket_hash), 21, 12)
)::uuid
WHERE login_id IS NULL;
ALTER TABLE wallet_login_tickets ALTER COLUMN login_id SET NOT NULL;
