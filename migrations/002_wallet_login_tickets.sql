CREATE TABLE IF NOT EXISTS wallet_login_tickets (
  ticket_hash text PRIMARY KEY,
  wallet_address text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS wallet_login_tickets_expiry_idx
  ON wallet_login_tickets (expires_at);
