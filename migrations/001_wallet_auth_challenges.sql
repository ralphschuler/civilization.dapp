CREATE TABLE IF NOT EXISTS wallet_auth_challenges (
  nonce_hash text PRIMARY KEY,
  request_id text NOT NULL,
  statement text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS wallet_auth_challenges_expiry_idx
  ON wallet_auth_challenges (expires_at);
