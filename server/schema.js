export const GAME_STATE_SCHEMA = `
CREATE TABLE IF NOT EXISTS game_players (
  anonymous_id text PRIMARY KEY,
  public_village_id text,
  state jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS public_village_id text;
CREATE UNIQUE INDEX IF NOT EXISTS game_players_public_village_id_unique ON game_players (public_village_id) WHERE public_village_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS game_actions (
  anonymous_id text NOT NULL REFERENCES game_players(anonymous_id) ON DELETE CASCADE,
  action_id text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anonymous_id, action_id)
);
CREATE TABLE IF NOT EXISTS game_battles (
  id bigserial PRIMARY KEY,
  attacker_anonymous_id text NOT NULL REFERENCES game_players(anonymous_id),
  defender_anonymous_id text NOT NULL REFERENCES game_players(anonymous_id),
  attacker_village_id text NOT NULL,
  defender_village_id text NOT NULL,
  action_id text NOT NULL,
  seed bytea NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attacker_anonymous_id, action_id)
);
`;
