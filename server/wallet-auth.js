import { randomBytes } from "node:crypto";
import { verifySiweMessage } from "@worldcoin/minikit-js/siwe";
import { getAddress, isAddress } from "viem";

export const WALLET_AUTH_STATEMENT = "Bestätige deine World-Wallet für den Civilization-Spielzugang.";
export const WALLET_AUTH_NONCE_TTL_MS = 5 * 60_000;

// This process-local store is intentionally only a replay guard for SIWE. It
// does not create a session, authorize game actions, or retain a wallet.
export class WalletAuthNonceStore {
  constructor({ ttlMs = WALLET_AUTH_NONCE_TTL_MS, now = () => Date.now(), random = () => randomBytes(32).toString("hex") } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.random = random;
    this.entries = new Map();
  }

  issue() {
    const now = this.now();
    for (const [nonce, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(nonce);
    let nonce;
    do { nonce = this.random(); } while (this.entries.has(nonce));
    const expiresAt = now + this.ttlMs;
    this.entries.set(nonce, { expiresAt });
    return { nonce, expiresAt };
  }

  // Consume before signature verification, so both successful and failed
  // attempts make a nonce unusable and cannot be replayed.
  consume(nonce) {
    const entry = this.entries.get(nonce);
    this.entries.delete(nonce);
    return entry && entry.expiresAt > this.now() ? entry : null;
  }
}

function validPayload(payload) {
  return payload && typeof payload === "object"
    && typeof payload.address === "string" && typeof payload.message === "string" && typeof payload.signature === "string"
    && payload.message.length > 0 && payload.message.length <= 16_384
    && payload.signature.length > 0 && payload.signature.length <= 1_024;
}

/** Verifies the SIWE payload and returns only its backend-verified address. */
export async function verifyWalletAuthPayload({ payload, nonce, verifier = verifySiweMessage } = {}) {
  if (typeof nonce !== "string" || !/^[A-Za-z0-9]{8,}$/.test(nonce) || !validPayload(payload) || !isAddress(payload.address)) {
    throw new Error("invalid_wallet_auth_payload");
  }
  const verification = await verifier(payload, nonce, WALLET_AUTH_STATEMENT);
  const signedAddress = verification?.siweMessageData?.address;
  if (!verification?.isValid || !isAddress(signedAddress) || getAddress(signedAddress) !== getAddress(payload.address)) {
    throw new Error("wallet_auth_verification_failed");
  }
  return getAddress(signedAddress);
}
