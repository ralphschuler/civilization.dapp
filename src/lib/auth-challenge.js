import crypto from "node:crypto";
import { database } from "./database.mjs";
export { WALLET_AUTH_STATEMENT } from "../auth/wallet-auth-statement.js";
import { WALLET_AUTH_STATEMENT } from "../auth/wallet-auth-statement.js";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function nonceHash(nonce) {
  return crypto.createHash("sha256").update(nonce).digest("hex");
}

/** Creates the one-time nonce used by the direct WalletAuth/SIWE flow. */
export async function createWalletAuthChallenge() {
  const nonce = crypto.randomBytes(32).toString("hex");
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
