import crypto from "node:crypto";
import { database } from "./database.mjs";
import { getAddress, isAddress } from "viem";

export const WALLET_LOGIN_TICKET_TTL_MS = 60_000;

export function hashWalletLoginTicket(ticket) {
  return crypto.createHash("sha256").update(ticket).digest("hex");
}

function normalizeWalletAddress(address) {
  return typeof address === "string" && isAddress(address)
    ? getAddress(address)
    : null;
}

/**
 * The raw ticket is returned exactly once to the same-origin HTTPS verify
 * response. PostgreSQL retains only its SHA-256 hash and the per-login UUID.
 */
export async function mintWalletLoginTicket(address) {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw new Error("invalid_wallet_address");
  const ticket = crypto.randomBytes(32).toString("base64url");
  const loginId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + WALLET_LOGIN_TICKET_TTL_MS);
  await database().query(
    "INSERT INTO wallet_login_tickets (ticket_hash, wallet_address, login_id, expires_at) VALUES ($1, $2, $3, $4)",
    [hashWalletLoginTicket(ticket), walletAddress, loginId, expiresAt],
  );
  await database()
    .query(
      "DELETE FROM wallet_login_tickets WHERE expires_at < now() - interval '1 day'",
    )
    .catch(() => undefined);
  return { ticket, loginId };
}

/** Atomically consumes one valid ticket across all application replicas. */
export async function consumeWalletLoginTicket(ticket, query) {
  if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(ticket))
    return null;
  // Tests can supply a query function; production always uses the shared pool.
  let take = query;
  if (!take) {
    take = database().query.bind(database());
  }
  if (typeof take !== "function") throw new Error("database_unavailable");
  const result = await take(
    "UPDATE wallet_login_tickets SET consumed_at = now() WHERE ticket_hash = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING wallet_address, login_id",
    [hashWalletLoginTicket(ticket)],
  );
  if (
    !result ||
    result.rowCount !== 1 ||
    !Array.isArray(result.rows) ||
    result.rows.length !== 1
  )
    return null;
  const walletAddress = normalizeWalletAddress(result.rows[0]?.wallet_address);
  const loginId = result.rows[0]?.login_id;
  return walletAddress && typeof loginId === "string"
    ? { walletAddress, loginId }
    : null;
}
