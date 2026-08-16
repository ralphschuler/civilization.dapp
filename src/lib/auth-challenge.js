import crypto from "node:crypto";
import { database } from "./database.mjs";

export const WALLET_AUTH_STATEMENT = "Sign in to Civilization DApp.";
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const LEGACY_WALLET_AUTH_STATEMENT =
  "Bestätige deine World-Wallet für den Civilization-Spielzugang.";
export const LEGACY_WALLET_AUTH_TTL_MS = 5 * 60 * 1000;

function nonceHash(nonce) {
  return crypto.createHash("sha256").update(nonce).digest("hex");
}

export async function createAuthChallenge() {
  const nonce = crypto.randomBytes(24).toString("hex");
  const requestId = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await database().query(
    "INSERT INTO wallet_auth_challenges (nonce_hash, request_id, statement, expires_at) VALUES ($1, $2, $3, $4)",
    [nonceHash(nonce), requestId, WALLET_AUTH_STATEMENT, expiresAt],
  );
  // Bounded housekeeping; challenge rows carry no wallet or signature data.
  await database()
    .query(
      "DELETE FROM wallet_auth_challenges WHERE expires_at < now() - interval '1 day'",
    )
    .catch(() => undefined);
  return {
    nonce,
    statement: WALLET_AUTH_STATEMENT,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Issues the intentionally narrow Stage-5 diagnostic challenge. request_id is
 * retained only to satisfy the already-deployed NOT NULL schema; it is neither
 * returned to the caller nor included in the SIWE message.
 */
export async function createLegacyWalletAuthChallenge() {
  const nonce = crypto.randomBytes(32).toString("hex");
  const requestId = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + LEGACY_WALLET_AUTH_TTL_MS);
  await database().query(
    "INSERT INTO wallet_auth_challenges (nonce_hash, request_id, statement, expires_at) VALUES ($1, $2, $3, $4)",
    [nonceHash(nonce), requestId, LEGACY_WALLET_AUTH_STATEMENT, expiresAt],
  );
  // Bounded housekeeping; challenge rows carry no wallet or signature data.
  await database()
    .query(
      "DELETE FROM wallet_auth_challenges WHERE expires_at < now() - interval '1 day'",
    )
    .catch(() => undefined);
  return { nonce, statement: LEGACY_WALLET_AUTH_STATEMENT, expiresAt };
}

export async function readAuthChallenge(nonce) {
  const result = await database().query(
    "SELECT statement, expires_at FROM wallet_auth_challenges WHERE nonce_hash = $1 AND consumed_at IS NULL AND expires_at > now()",
    [nonceHash(nonce)],
  );
  if (!result.rowCount) return null;
  return {
    statement: result.rows[0].statement,
    expiresAt: new Date(result.rows[0].expires_at),
  };
}

export async function consumeAuthChallenge(nonce) {
  const result = await database().query(
    "UPDATE wallet_auth_challenges SET consumed_at = now() WHERE nonce_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING nonce_hash",
    [nonceHash(nonce)],
  );
  return result.rowCount === 1;
}

/** Atomically takes only a Stage-5 legacy challenge, isolated from Auth.js. */
export async function takeLegacyWalletAuthChallenge(nonce) {
  const result = await database().query(
    "UPDATE wallet_auth_challenges SET consumed_at = now() WHERE nonce_hash = $1 AND statement = $2 AND consumed_at IS NULL AND expires_at > now() RETURNING statement, expires_at",
    [nonceHash(nonce), LEGACY_WALLET_AUTH_STATEMENT],
  );
  if (result.rowCount !== 1) return null;
  return {
    statement: result.rows[0].statement,
    expiresAt: new Date(result.rows[0].expires_at),
  };
}
