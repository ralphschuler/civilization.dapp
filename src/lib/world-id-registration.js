import { MiniKit } from "@worldcoin/minikit-js";
import { getAddress, isAddress } from "viem";
import { WORLD_CHAIN_ID } from "../world-chain.js";
import {
  encodeWorldIdRegistration,
  validUserOpHash,
} from "../world-game/actions.js";
import { readCivilizationState } from "../world-game/reads.js";

const terminalReceiptFailure = (error) =>
  error instanceof Error && error.message === "Transaction failed";

/**
 * Runs the World ID v4 registration transaction independently of React.
 * A timed-out receipt intentionally remains resumable; a failed/reverted one
 * is terminal and is cleared before another transaction can be submitted.
 *
 * @param {{
 *   walletAddress: string,
 *   contractAddress: string,
 *   registration: unknown,
 *   pollReceipt: (hash: string) => Promise<any>,
 *   readState?: (wallet: string, contract: string) => Promise<{ registered: boolean }>,
 *   pendingUserOpHash?: string | null,
 *   onPendingUserOpHash?: (hash: string | null) => void,
 *   miniKit?: typeof MiniKit,
 * }} options
 */
export async function registerWorldIdWithMiniKit({
  walletAddress,
  contractAddress,
  registration,
  pollReceipt,
  readState = undefined,
  pendingUserOpHash = null,
  onPendingUserOpHash = () => {},
  miniKit = MiniKit,
}) {
  if (!isAddress(walletAddress)) throw new Error("invalid_wallet");
  if (!isAddress(contractAddress)) throw new Error("invalid_contract");
  if (typeof pollReceipt !== "function")
    throw new Error("receipt_poller_required");
  if (typeof onPendingUserOpHash !== "function")
    throw new Error("pending_hash_handler_required");

  const wallet = getAddress(walletAddress);
  const contract = getAddress(contractAddress);
  const getState =
    typeof readState === "function"
      ? readState
      : (address) => readCivilizationState(address, contract);

  // Every gesture reads the contract before either resuming or sending.
  const before = await getState(wallet, contract);
  if (before.registered) {
    onPendingUserOpHash(null);
    return { state: before, alreadyRegistered: true };
  }
  if (pendingUserOpHash !== null && !validUserOpHash(pendingUserOpHash))
    throw new Error("invalid_pending_user_op");

  let userOpHash = pendingUserOpHash;
  if (userOpHash === null) {
    const response = await miniKit.sendTransaction({
      chainId: WORLD_CHAIN_ID,
      transactions: encodeWorldIdRegistration(registration, contract),
    });
    if (response.executedWith !== "minikit")
      throw new Error("world_app_wallet_required");
    if (
      response.data?.status !== "success" ||
      !validUserOpHash(response.data.userOpHash)
    )
      throw new Error(
        response.data?.error_code || "world_id_registration_rejected",
      );
    if (
      !isAddress(response.data.from) ||
      getAddress(response.data.from) !== wallet
    )
      throw new Error("transaction_wallet_mismatch");
    userOpHash = response.data.userOpHash;
    onPendingUserOpHash(userOpHash);
  }

  let receiptResult;
  try {
    receiptResult = await pollReceipt(userOpHash);
  } catch (error) {
    if (terminalReceiptFailure(error)) {
      onPendingUserOpHash(null);
      throw new Error("transaction_failed");
    }
    throw error;
  }
  if (receiptResult.receipt?.status !== "success") {
    onPendingUserOpHash(null);
    throw new Error("transaction_failed");
  }

  const after = await getState(wallet, contract);
  if (!after.registered) throw new Error("world_id_registration_not_confirmed");
  onPendingUserOpHash(null);
  return { state: after, alreadyRegistered: false, userOpHash };
}
