import { getAddress } from "viem";
import { validUserOpHash } from "./actions.js";

const storageKey = (wallet, contract) =>
  `civilization:pending-registration:${wallet.toLowerCase()}:${contract.toLowerCase()}`;

/**
 * Keeps only the opaque UserOp handle needed to resume a registration poll.
 * It is session-scoped and bound to both the WalletAuth address and contract,
 * so an intent cannot be resumed for a different wallet or deployment.
 */
export function restorePendingRegistration(walletAddress, contractAddress) {
  const wallet = getAddress(walletAddress);
  const contract = getAddress(contractAddress);
  try {
    const record = JSON.parse(
      globalThis.sessionStorage?.getItem(storageKey(wallet, contract)) ||
        "null",
    );
    return record?.wallet?.toLowerCase() === wallet.toLowerCase() &&
      record?.contract?.toLowerCase() === contract.toLowerCase() &&
      validUserOpHash(record.userOpHash)
      ? record.userOpHash
      : null;
  } catch {
    return null;
  }
}

export function persistPendingRegistration(
  walletAddress,
  contractAddress,
  userOpHash,
) {
  const wallet = getAddress(walletAddress);
  const contract = getAddress(contractAddress);
  const key = storageKey(wallet, contract);
  try {
    if (!validUserOpHash(userOpHash)) {
      globalThis.sessionStorage?.removeItem(key);
      return;
    }
    globalThis.sessionStorage?.setItem(
      key,
      JSON.stringify({ wallet, contract, userOpHash }),
    );
  } catch {
    // Storage is optional; an unavailable store must not change chain safety.
  }
}
