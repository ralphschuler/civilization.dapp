import { getAddress, isAddress } from "viem";
import { WALLET_AUTH_STATEMENT } from "../auth/wallet-auth-statement.js";

export const walletAuthStatement = WALLET_AUTH_STATEMENT;

function isWalletAuthPayload(value) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof value.address === "string" &&
    typeof value.message === "string" &&
    typeof value.signature === "string"
  );
}

function readChallenge(value) {
  if (!value || typeof value !== "object") throw new Error("nonce_unavailable");
  const { nonce, expires_at: expiresAt } = value;
  if (
    typeof nonce !== "string" ||
    !/^[A-Za-z0-9]{8,}$/.test(nonce) ||
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    throw new Error("nonce_unavailable");
  }
  return { nonce, expirationTime: new Date(expiresAt) };
}

/** Returns only the checksum address accepted by the server-side SIWE verifier. */
export async function verifyWalletForDirectGame({ fetchImpl, walletAuth }) {
  const nonceResponse = await fetchImpl("/api/wallet-auth/nonce", {
    method: "POST",
    cache: "no-store",
  });
  if (!nonceResponse.ok) throw new Error("nonce_unavailable");
  const { nonce, expirationTime } = readChallenge(await nonceResponse.json());

  const result = await walletAuth({
    nonce,
    statement: walletAuthStatement,
    expirationTime,
  });
  if (result.executedWith !== "minikit" || !isWalletAuthPayload(result.data)) {
    throw new Error("native_wallet_auth_failed");
  }

  const verificationResponse = await fetchImpl("/api/wallet-auth/verify", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ nonce, payload: result.data }),
  });
  const verification = await verificationResponse.json().catch(() => null);
  const address =
    verification && typeof verification === "object"
      ? verification.address
      : undefined;
  if (
    !verificationResponse.ok ||
    verification?.isValid !== true ||
    typeof address !== "string" ||
    !isAddress(address)
  ) {
    throw new Error("wallet_auth_verification_failed");
  }
  return getAddress(address);
}
