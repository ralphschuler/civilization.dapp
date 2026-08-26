CREATE TABLE IF NOT EXISTS village_appearance_preferences (
  wallet_address text PRIMARY KEY,
  appearance text NOT NULL DEFAULT 'classic'
    CHECK (appearance IN ('classic', 'dusk')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
