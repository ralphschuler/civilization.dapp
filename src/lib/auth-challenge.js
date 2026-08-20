import crypto from "node:crypto";
import { database } from "./database.mjs";
export { WALLET_AUTH_STATEMENT } from "../auth/wallet-auth-statement.js";
import { WALLET_AUTH_STATEMENT } from "../auth/wallet-auth-statement.js";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const MAX_OUTSTANDING_WALLET_AUTH_CHALLENGES = 500;
export const MAX_OUTSTANDING_WALLET_AUTH_CHALLENGES_PER_SOURCE = 8;
const CHALLENGE_LOCK_KEY = 6_871_245_101;
const PRIVACY_KEY = /^[a-f0-9]{64}$/;

function nonceHash(nonce) {
  return crypto.createHash("sha256").update(nonce).digest("hex");
}

/** Creates the one-time nonce used by the direct WalletAuth/SIWE flow. */
export async function createWalletAuthChallenge(dependencies = {}) {
  const { sourceKey } = dependencies;
  if (typeof sourceKey !== "string" || !PRIVACY_KEY.test(sourceKey))
    throw new Error("wallet_auth_challenge_source_unavailable");
  const nonce = crypto.randomBytes(32).toString("hex");
  const requestId = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const query =
    dependencies.query ??
    ((sql, parameters) => database().query(sql, parameters));
  const result = await query(
    `WITH locked AS (SELECT pg_advisory_xact_lock($6)),
      retained AS (
        DELETE FROM wallet_auth_challenges
        WHERE expires_at < now() - interval '1 day'
      )
     INSERT INTO wallet_auth_challenges
       (nonce_hash, request_id, statement, expires_at, source_key)
     SELECT $1, $2, $3, $4, $5 FROM locked
     WHERE (SELECT count(*) FROM wallet_auth_challenges
       WHERE consumed_at IS NULL AND expires_at > now()) < $7
       AND (SELECT count(*) FROM wallet_auth_challenges
       WHERE source_key = $5 AND consumed_at IS NULL AND expires_at > now()) < $8
     RETURNING nonce_hash`,
    [
      nonceHash(nonce),
      requestId,
      WALLET_AUTH_STATEMENT,
      expiresAt,
      sourceKey,
      CHALLENGE_LOCK_KEY,
      MAX_OUTSTANDING_WALLET_AUTH_CHALLENGES,
      MAX_OUTSTANDING_WALLET_AUTH_CHALLENGES_PER_SOURCE,
    ],
  );
  if (result.rowCount !== 1)
    throw new Error("wallet_auth_challenge_capacity_exhausted");
  return { nonce, statement: WALLET_AUTH_STATEMENT, expiresAt };
}

/** Atomically consumes the active WalletAuth/SIWE challenge. */
export async function takeWalletAuthChallenge(nonce) {
  const result = await database().query(
    "UPDATE wallet_auth_challenges SET consumed_at = now() WHERE nonce_hash = $1 AND statement = $2 AND consumed_at IS NULL AND expires_at > now() RETURNING statement, expires_at",
    [nonceHash(nonce), WALLET_AUTH_STATEMENT],
  );
  if (result.rowCount !== 1) return null;
  return {
    statement: result.rows[0].statement,
    expiresAt: new Date(result.rows[0].expires_at),
  };
}
