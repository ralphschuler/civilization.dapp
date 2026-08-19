import { MiniKit } from "@worldcoin/minikit-js";
import { encodeFunctionData, getAddress, isAddress } from "viem";
import {
  CIVILIZATION_GAME_ABI,
  WORLD_TOKEN_ABI,
} from "../abi/CivilizationGame.js";
import { WORLD_CHAIN_ID } from "../world-chain.js";
import {
  BUILDING_INDEX,
  CIVILIZATION_GAME_ADDRESS,
  TROOP_INDEX,
  WORLD_TOKEN_UNIT,
} from "./constants.js";
import { readCivilizationState } from "./reads.js";

const transaction = (to, data) => ({ to, data, value: "0x0" });
const MARKET_RESOURCE_INDEX = { wood: 0, clay: 1, stone: 2 };
const validUserOpHash = (hash) =>
  typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash);

export function encodeWalletRegistration(
  contractAddress = CIVILIZATION_GAME_ADDRESS,
) {
  return [
    transaction(
      getAddress(contractAddress),
      encodeFunctionData({
        abi: CIVILIZATION_GAME_ABI,
        functionName: "registerWallet",
      }),
    ),
  ];
}

export function encodeWorldGameAction(
  type,
  payload = {},
  contractAddress = CIVILIZATION_GAME_ADDRESS,
  worldTokenAddress = "",
) {
  const game = getAddress(contractAddress);
  if (type === "claim")
    return [
      transaction(
        game,
        encodeFunctionData({
          abi: CIVILIZATION_GAME_ABI,
          functionName: "claim",
        }),
      ),
    ];
  if (type === "upgrade") {
    if (!Object.hasOwn(BUILDING_INDEX, payload.building))
      throw new Error("invalid_building");
    return [
      transaction(
        game,
        encodeFunctionData({
          abi: CIVILIZATION_GAME_ABI,
          functionName: "upgrade",
          args: [BUILDING_INDEX[payload.building]],
        }),
      ),
    ];
  }
  if (type === "complete_upgrade")
    return [
      transaction(
        game,
        encodeFunctionData({
          abi: CIVILIZATION_GAME_ABI,
          functionName: Number.isInteger(payload.slot)
            ? "completeUpgrade"
            : "completeUpgrade",
          args: Number.isInteger(payload.slot) ? [payload.slot] : [],
        }),
      ),
    ];
  if (type === "prestige")
    return [
      transaction(
        game,
        encodeFunctionData({
          abi: CIVILIZATION_GAME_ABI,
          functionName: "prestige",
        }),
      ),
    ];
  if (type === "train") {
    if (
      !Object.hasOwn(TROOP_INDEX, payload.troop) ||
      !Number.isSafeInteger(payload.amount) ||
      payload.amount < 1
    )
      throw new Error("invalid_troop");
    return [
      transaction(
        game,
        encodeFunctionData({
          abi: CIVILIZATION_GAME_ABI,
          functionName: "train",
          args: [TROOP_INDEX[payload.troop], BigInt(payload.amount)],
        }),
      ),
    ];
  }
  if (type === "start_raid") {
    if (!isAddress(payload.targetId)) throw new Error("invalid_target");
    return [
      transaction(
        game,
        encodeFunctionData({
          abi: CIVILIZATION_GAME_ABI,
          functionName: "startRaid",
          args: [
            getAddress(payload.targetId),
            BigInt(payload.army?.spear || 0),
            BigInt(payload.army?.archer || 0),
            BigInt(payload.army?.rider || 0),
          ],
        }),
      ),
    ];
  }
  if (type === "resolve_raid")
    return [
      transaction(
        game,
        encodeFunctionData({
          abi: CIVILIZATION_GAME_ABI,
          functionName: "resolveRaid",
        }),
      ),
    ];
  if (type === "boost") {
    if (!Number.isSafeInteger(payload.hours) || payload.hours < 1)
      throw new Error("invalid_boost");
    if (!isAddress(worldTokenAddress)) throw new Error("invalid_world_token");
    const amount = BigInt(payload.hours) * WORLD_TOKEN_UNIT;
    return [
      transaction(
        getAddress(worldTokenAddress),
        encodeFunctionData({
          abi: WORLD_TOKEN_ABI,
          functionName: "approve",
          args: [game, amount],
        }),
      ),
      transaction(
        game,
        encodeFunctionData({
          abi: CIVILIZATION_GAME_ABI,
          functionName: "boostConstruction",
          args: Number.isInteger(payload.slot)
            ? [payload.slot, BigInt(payload.hours)]
            : [BigInt(payload.hours)],
        }),
      ),
    ];
  }
  if (type === "market_buy" || type === "market_sell") {
    if (
      !Object.hasOwn(MARKET_RESOURCE_INDEX, payload.resource) ||
      !Number.isSafeInteger(payload.amount) ||
      payload.amount < 1 ||
      typeof payload.limit !== "bigint" ||
      !Number.isSafeInteger(payload.deadline) ||
      payload.deadline < 1
    )
      throw new Error("invalid_market_order");
    return [
      transaction(
        game,
        encodeFunctionData({
          abi: CIVILIZATION_GAME_ABI,
          functionName: type === "market_buy" ? "buyResource" : "sellResource",
          args: [
            MARKET_RESOURCE_INDEX[payload.resource],
            BigInt(payload.amount),
            payload.limit,
            BigInt(payload.deadline),
          ],
        }),
      ),
    ];
  }
  throw new Error(
    type === "swap" ? "world_market_unavailable" : "invalid_action",
  );
}

export async function registerWalletWithMiniKit({
  walletAddress,
  contractAddress = CIVILIZATION_GAME_ADDRESS,
  pollReceipt,
  readState = undefined,
  pendingUserOpHash = /** @type {string | null} */ (null),
  onPendingUserOpHash = /** @type {(hash: string | null) => void} */ (() => {}),
  miniKit = MiniKit,
}) {
  const wallet = getAddress(walletAddress);
  const game = getAddress(contractAddress);
  if (typeof pollReceipt !== "function")
    throw new Error("receipt_poller_required");
  if (typeof onPendingUserOpHash !== "function")
    throw new Error("pending_hash_handler_required");
  const getState =
    typeof readState === "function"
      ? readState
      : (address) => readCivilizationState(address, game);
  const before = await getState(wallet);
  if (before.registered) {
    onPendingUserOpHash(null);
    return { state: before, alreadyRegistered: true };
  }
  let userOpHash = pendingUserOpHash;
  if (userOpHash !== null && !validUserOpHash(userOpHash))
    throw new Error("invalid_pending_user_op");
  if (userOpHash === null) {
    const response = await miniKit.sendTransaction({
      chainId: WORLD_CHAIN_ID,
      transactions: encodeWalletRegistration(game),
    });
    if (response.executedWith !== "minikit")
      throw new Error("world_app_wallet_required");
    if (
      response.data?.status !== "success" ||
      !validUserOpHash(response.data.userOpHash)
    )
      throw new Error(
        response.data?.error_code || "wallet_registration_rejected",
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
    if (error instanceof Error && error.message === "Transaction failed") {
      onPendingUserOpHash(null);
      throw new Error("transaction_failed");
    }
    throw error;
  }
  if (receiptResult.receipt?.status !== "success") {
    onPendingUserOpHash(null);
    throw new Error("transaction_failed");
  }
  const after = await getState(wallet);
  if (!after.registered) throw new Error("wallet_registration_not_confirmed");
  onPendingUserOpHash(null);
  return { state: after, alreadyRegistered: false, userOpHash };
}

export { validUserOpHash };
