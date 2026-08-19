CREATE TABLE IF NOT EXISTS wallet_auth_sessions (
  session_hash text PRIMARY KEY,
  wallet_address text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS wallet_auth_sessions_expiry_idx
  ON wallet_auth_sessions (expires_at);
