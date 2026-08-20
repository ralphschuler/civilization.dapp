import crypto from "node:crypto";
import { getAddress, isAddress } from "viem";
import { database } from "./database.mjs";

export const WALLET_AUTH_SESSION_COOKIE = "__Host-civilization_wallet_session";
export const WALLET_AUTH_SESSION_TTL_SECONDS = 15 * 60;

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isSessionToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

function checksumAddress(address) {
  return typeof address === "string" &&
    isAddress(address) &&
    getAddress(address) === address
    ? address
    : null;
}

export function walletAuthSessionTokenFromCookie(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === WALLET_AUTH_SESSION_COOKIE) {
      const token = value.join("=");
      return isSessionToken(token) ? token : null;
    }
  }
  return null;
}

export function walletAuthSessionCookie(token, expiresAt) {
  if (!isSessionToken(token) || !(expiresAt instanceof Date))
    throw new Error("invalid_wallet_auth_session");
  return `${WALLET_AUTH_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${WALLET_AUTH_SESSION_TTL_SECONDS}`;
}

export function expiredWalletAuthSessionCookie() {
  return `${WALLET_AUTH_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Creates an opaque, short-lived server session after WalletAuth verification. */
export async function createWalletAuthSession(address, dependencies = {}) {
  const walletAddress = checksumAddress(address);
  if (!walletAddress) throw new Error("invalid_wallet_auth_session");
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + WALLET_AUTH_SESSION_TTL_SECONDS * 1000,
  );
  const query =
    dependencies.query ??
    ((sql, parameters) => database().query(sql, parameters));
  await query(
    `WITH retained AS (
       DELETE FROM wallet_auth_sessions WHERE expires_at < now() - interval '1 day'
     )
     INSERT INTO wallet_auth_sessions (session_hash, wallet_address, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash(token), walletAddress, expiresAt],
  );
  return { token, expiresAt, address: walletAddress };
}

/** Restores only a still-live, checksum-address session. Invalid input fails closed. */
export async function readWalletAuthSession(cookieHeader, dependencies = {}) {
  const token = walletAuthSessionTokenFromCookie(cookieHeader);
  if (!token) return null;
  const query =
    dependencies.query ??
    ((sql, parameters) => database().query(sql, parameters));
  const result = await query(
    "SELECT wallet_address FROM wallet_auth_sessions WHERE session_hash = $1 AND expires_at > now()",
    [tokenHash(token)],
  );
  if (result.rowCount !== 1) return null;
  return checksumAddress(result.rows[0]?.wallet_address);
}

/** Deletes the server record; a captured cookie cannot be used afterwards. */
export async function invalidateWalletAuthSession(
  cookieHeader,
  dependencies = {},
) {
  const token = walletAuthSessionTokenFromCookie(cookieHeader);
  if (!token) return false;
  const query =
    dependencies.query ??
    ((sql, parameters) => database().query(sql, parameters));
  const result = await query(
    "DELETE FROM wallet_auth_sessions WHERE session_hash = $1",
    [tokenHash(token)],
  );
  return result.rowCount === 1;
}
