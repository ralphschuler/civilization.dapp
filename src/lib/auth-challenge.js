import crypto from 'node:crypto';
import pg from 'pg';

export const WALLET_AUTH_STATEMENT = 'Sign in to Civilization DApp.';
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const LEGACY_WALLET_AUTH_STATEMENT = 'Bestätige deine World-Wallet für den Civilization-Spielzugang.';
export const LEGACY_WALLET_AUTH_TTL_MS = 5 * 60 * 1000;

let pool;
let schemaReady;

function database() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString && !process.env.PGHOST && !process.env.PGDATABASE) throw new Error('database_unavailable');
    pool = new pg.Pool({ ...(connectionString ? { connectionString } : {}), max: 2 });
  }
  return pool;
}

function nonceHash(nonce) {
  return crypto.createHash('sha256').update(nonce).digest('hex');
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = database().query(`
      CREATE TABLE IF NOT EXISTS wallet_auth_challenges (
        nonce_hash text PRIMARY KEY,
        request_id text NOT NULL,
        statement text NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS wallet_auth_challenges_expiry_idx
        ON wallet_auth_challenges (expires_at);
    `).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

export async function authChallengeReady() {
  await ensureSchema();
  await database().query('SELECT 1');
  return true;
}

export async function createAuthChallenge() {
  await ensureSchema();
  const nonce = crypto.randomBytes(24).toString('hex');
  const requestId = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await database().query(
    'INSERT INTO wallet_auth_challenges (nonce_hash, request_id, statement, expires_at) VALUES ($1, $2, $3, $4)',
    [nonceHash(nonce), requestId, WALLET_AUTH_STATEMENT, expiresAt],
  );
  // Bounded housekeeping; challenge rows carry no wallet or signature data.
  await database().query("DELETE FROM wallet_auth_challenges WHERE expires_at < now() - interval '1 day'").catch(() => undefined);
  return { nonce, statement: WALLET_AUTH_STATEMENT, expiresAt: expiresAt.toISOString() };
}

/**
 * Issues the intentionally narrow Stage-5 diagnostic challenge. request_id is
 * retained only to satisfy the already-deployed NOT NULL schema; it is neither
 * returned to the caller nor included in the SIWE message.
 */
export async function createLegacyWalletAuthChallenge() {
  await ensureSchema();
  const nonce = crypto.randomBytes(32).toString('hex');
  const requestId = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + LEGACY_WALLET_AUTH_TTL_MS);
  await database().query(
    'INSERT INTO wallet_auth_challenges (nonce_hash, request_id, statement, expires_at) VALUES ($1, $2, $3, $4)',
    [nonceHash(nonce), requestId, LEGACY_WALLET_AUTH_STATEMENT, expiresAt],
  );
  // Bounded housekeeping; challenge rows carry no wallet or signature data.
  await database().query("DELETE FROM wallet_auth_challenges WHERE expires_at < now() - interval '1 day'").catch(() => undefined);
  return { nonce, statement: LEGACY_WALLET_AUTH_STATEMENT, expiresAt };
}

export async function readAuthChallenge(nonce) {
  await ensureSchema();
  const result = await database().query(
    'SELECT statement, expires_at FROM wallet_auth_challenges WHERE nonce_hash = $1 AND consumed_at IS NULL AND expires_at > now()',
    [nonceHash(nonce)],
  );
  if (!result.rowCount) return null;
  return {
    statement: result.rows[0].statement,
    expiresAt: new Date(result.rows[0].expires_at),
  };
}

export async function consumeAuthChallenge(nonce) {
  await ensureSchema();
  const result = await database().query(
    'UPDATE wallet_auth_challenges SET consumed_at = now() WHERE nonce_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING nonce_hash',
    [nonceHash(nonce)],
  );
  return result.rowCount === 1;
}

/** Atomically takes only a Stage-5 legacy challenge, isolated from Auth.js. */
export async function takeLegacyWalletAuthChallenge(nonce) {
  await ensureSchema();
  const result = await database().query(
    'UPDATE wallet_auth_challenges SET consumed_at = now() WHERE nonce_hash = $1 AND statement = $2 AND consumed_at IS NULL AND expires_at > now() RETURNING statement, expires_at',
    [nonceHash(nonce), LEGACY_WALLET_AUTH_STATEMENT],
  );
  if (result.rowCount !== 1) return null;
  return {
    statement: result.rows[0].statement,
    expiresAt: new Date(result.rows[0].expires_at),
  };
}
