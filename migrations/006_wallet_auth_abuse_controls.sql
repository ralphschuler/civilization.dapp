-- Shared, short-lived counters keep WalletAuth limits consistent across replicas.
CREATE TABLE IF NOT EXISTS wallet_auth_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  count integer NOT NULL CHECK (count > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, key_hash, window_started_at)
);

CREATE INDEX IF NOT EXISTS wallet_auth_rate_limits_expiry_idx
  ON wallet_auth_rate_limits (expires_at);

-- Aggregate-only operational counters: no IP, nonce, address, or signature data.
CREATE TABLE IF NOT EXISTS wallet_auth_metrics (
  metric text NOT NULL,
  bucket_started_at timestamptz NOT NULL,
  count bigint NOT NULL CHECK (count >= 0),
  PRIMARY KEY (metric, bucket_started_at)
);

CREATE INDEX IF NOT EXISTS wallet_auth_metrics_bucket_idx
  ON wallet_auth_metrics (bucket_started_at);
