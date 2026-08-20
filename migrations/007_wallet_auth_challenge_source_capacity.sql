-- Only an HMAC-derived source key is retained for per-source challenge caps.
-- Existing short-lived challenges predate this control and deliberately remain
-- unassigned rather than trying to reconstruct or persist their raw source.
ALTER TABLE wallet_auth_challenges
  ADD COLUMN IF NOT EXISTS source_key text;

ALTER TABLE wallet_auth_challenges
  ADD CONSTRAINT wallet_auth_challenges_source_key_privacy_check
  CHECK (source_key IS NULL OR source_key ~ '^[a-f0-9]{64}$');

CREATE INDEX IF NOT EXISTS wallet_auth_challenges_source_outstanding_idx
  ON wallet_auth_challenges (source_key, expires_at)
  WHERE consumed_at IS NULL AND source_key IS NOT NULL;
