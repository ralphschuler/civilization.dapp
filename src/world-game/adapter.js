import { MiniKit } from "@worldcoin/minikit-js";
import { getAddress, isAddress, parseEventLogs } from "viem";
import { CIVILIZATION_GAME_ABI } from "../abi/CivilizationGame.js";
import { WORLD_CHAIN_ID } from "../world-chain.js";
import { CIVILIZATION_GAME_ADDRESS, TROOP_IDS } from "./constants.js";
import { encodeWorldGameAction, validUserOpHash } from "./actions.js";
import { constructionBoostEligibility } from "./boost-eligibility.js";
import {
  claimEligibility,
  getContractBuildingCost,
  getContractCapacity,
  getContractProduction,
  getContractRequirements,
  getContractTroopRequirements,
  projectCivilizationState,
} from "./projections.js";
import {
  readCivilizationState,
  readContractBuildDuration,
  readRawState,
} from "./reads.js";

function pendingStorage(wallet, game) {
  const key = `civilization:pending-user-op:${wallet.toLowerCase()}:${game.toLowerCase()}`;
  try {
    return { key, store: globalThis.sessionStorage };
  } catch {
    return { key, store: null };
  }
}

function restorePending({ key, store }, wallet, game) {
  try {
    const record = JSON.parse(store?.getItem(key) || "null");
    return record?.wallet?.toLowerCase() === wallet.toLowerCase() &&
      record?.contract?.toLowerCase() === game.toLowerCase() &&
      typeof record.action === "string" &&
      validUserOpHash(record.userOpHash)
      ? record
      : null;
  } catch {
    return null;
  }
}

function persistPending({ key, store }, wallet, game, action, userOpHash) {
  try {
    if (!action || !userOpHash) {
      store?.removeItem(key);
      return;
    }
    store?.setItem(
      key,
      JSON.stringify({ wallet, contract: game, action, userOpHash }),
    );
  } catch {
    // Session storage is optional; losing it must not alter transaction safety.
  }
}

export function createWorldGameAdapter({
  walletAddress,
  contractAddress = CIVILIZATION_GAME_ADDRESS,
  worldTokenAddress = "",
  pollReceipt,
  miniKit = MiniKit,
  readState: suppliedReadState = undefined,
  readBuildDuration: suppliedBuildDuration = undefined,
}) {
  const wallet = getAddress(walletAddress);
  const game = getAddress(contractAddress);
  if (typeof pollReceipt !== "function")
    throw new Error("receipt_poller_required");
  const storage = pendingStorage(wallet, game);
  const restored = restorePending(storage, wallet, game);
  let lastRaid = null;
  let pendingUserOpHash = restored?.userOpHash || null;
  let pendingAction = restored?.action || null;
  let actionInFlight = null;
  const sendTransaction =
    miniKit === MiniKit
      ? MiniKit.sendTransaction.bind(MiniKit)
      : miniKit.sendTransaction.bind(miniKit);
  const readState = async () => {
    const current = suppliedReadState
      ? await suppliedReadState(wallet, game)
      : await readCivilizationState(wallet, game);
    if (!current.registered) throw new Error("world_registration_required");
    return { ...current, lastRaid };
  };
  const clearPending = () => {
    pendingUserOpHash = null;
    pendingAction = null;
    persistPending(storage, wallet, game, null, null);
  };
  const executeAction = async (type, payload) => {
    if (pendingUserOpHash && pendingAction !== type)
      throw new Error("transaction_pending");
    if (
      type === "claim" &&
      !pendingUserOpHash &&
      !claimEligibility(await readState())
    )
      throw new Error("claim_not_available");
    if (type === "boost" && !pendingUserOpHash) {
      const state = await readState();
      const eligibility = constructionBoostEligibility({
        construction: state.construction,
        now: state.chainTimestamp,
      });
      if (!eligibility.eligible) throw new Error(eligibility.reason);
    }
    const raidBefore =
      type === "resolve_raid" && !pendingUserOpHash
        ? await readRawState(wallet, false, game)
        : null;
    if (type === "start_raid" && !pendingUserOpHash) {
      const target = getAddress(payload.targetId);
      if (target === wallet) throw new Error("self_raid");
      if (!(await readRawState(target, false, game)).registered)
        throw new Error("target_not_registered");
    }
    let userOpHash = pendingUserOpHash;
    if (!userOpHash) {
      const response = await sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: encodeWorldGameAction(
          type,
          payload,
          game,
          worldTokenAddress,
        ),
      });
      if (response.executedWith !== "minikit")
        throw new Error("world_app_wallet_required");
      if (
        response.data?.status !== "success" ||
        !validUserOpHash(response.data.userOpHash)
      )
        throw new Error(response.data?.error_code || "transaction_rejected");
      if (
        !isAddress(response.data.from) ||
        getAddress(response.data.from) !== wallet
      )
        throw new Error("transaction_wallet_mismatch");
      userOpHash = response.data.userOpHash;
      pendingUserOpHash = userOpHash;
      pendingAction = type;
      persistPending(storage, wallet, game, type, userOpHash);
    }
    let receipt;
    try {
      ({ receipt } = await pollReceipt(userOpHash));
    } catch (error) {
      if (error instanceof Error && error.message === "receipt_timeout")
        return { state: await readState(), pending: true, userOpHash };
      if (error instanceof Error && error.message === "Transaction failed") {
        clearPending();
        throw new Error("transaction_failed");
      }
      throw error;
    }
    if (receipt?.status !== "success") {
      clearPending();
      throw new Error("transaction_failed");
    }
    if (type === "resolve_raid") {
      const resolved = parseEventLogs({
        abi: CIVILIZATION_GAME_ABI,
        eventName: "RaidResolved",
        logs: receipt.logs,
        strict: false,
      }).find((event) => getAddress(event.args.attacker) === wallet);
      if (resolved) {
        const won = resolved.args.attackerWon;
        const casualtyRate = won ? 8 : 38;
        const casualties = Object.fromEntries(
          TROOP_IDS.map((id) => [
            id,
            Math.ceil(
              ((raidBefore?.pendingRaid?.army?.[id] || 0) * casualtyRate) / 100,
            ),
          ]),
        );
        lastRaid = {
          ok: won,
          target: getAddress(resolved.args.defender),
          attack: Number(resolved.args.attack),
          defense: Number(resolved.args.defense),
          casualties,
          stolen: {
            wood: Number(resolved.args.wood),
            clay: Number(resolved.args.clay),
            stone: Number(resolved.args.stone),
            gold: Number(resolved.args.gold),
          },
        };
      }
    }
    clearPending();
    return { state: await readState(), pending: false, userOpHash };
  };
  const adapter = {
    getBuildingCost: getContractBuildingCost,
    getRequirements: getContractRequirements,
    getTroopRequirements: getContractTroopRequirements,
    getCapacity: getContractCapacity,
    getProduction: getContractProduction,
    projectState: projectCivilizationState,
    claimEligibility,
    readBuildDuration(buildingId, nextLevel) {
      return suppliedBuildDuration
        ? suppliedBuildDuration(buildingId, nextLevel, game)
        : readContractBuildDuration(buildingId, nextLevel, game);
    },
    hasPending() {
      return Boolean(pendingUserOpHash && pendingAction);
    },
    pending() {
      return pendingUserOpHash
        ? {
            wallet,
            contract: game,
            action: pendingAction,
            userOpHash: pendingUserOpHash,
          }
        : null;
    },
    async resumePending() {
      return pendingUserOpHash && pendingAction
        ? adapter.execute(pendingAction)
        : null;
    },
    readState,
    async pickOpponent() {
      const result = await miniKit.shareContacts({
        isMultiSelectEnabled: false,
      });
      if (result.executedWith !== "minikit" || !result.data?.contacts?.length)
        throw new Error("contact_not_selected");
      const contact = result.data.contacts[0];
      const address = getAddress(contact.walletAddress);
      if (address === wallet) throw new Error("self_raid");
      if (!(await readRawState(address, false, game)).registered)
        throw new Error("target_not_registered");
      return { address, username: contact.username || address };
    },
    async execute(type, payload = {}) {
      if (actionInFlight) {
        if (pendingAction !== type && actionInFlight.type !== type)
          throw new Error("transaction_pending");
        return actionInFlight.promise;
      }
      const promise = executeAction(type, payload).finally(() => {
        actionInFlight = null;
      });
      actionInFlight = { type, promise };
      return promise;
    },
  };
  return adapter;
}
