import { MiniKit } from '@worldcoin/minikit-js';
import { createPublicClient, encodeFunctionData, formatUnits, getAddress, http, isAddress, parseEventLogs, zeroAddress } from 'viem';
import { CIVILIZATION_GAME_ABI, WORLD_TOKEN_ABI } from './abi/CivilizationGame.js';
import { WORLD_CHAIN_ID, WORLD_CHAIN_MAINNET_RPC_URL } from './world.js';

export const CIVILIZATION_GAME_ADDRESS = '0x0E6689d0649Ad9037465d178231b10F18518D2b0';
export const WORLD_TOKEN_ADDRESS = '0x2cFc85d8E48F8EAB294be644d9E25C3030863003';
export const BUILDING_INDEX = Object.freeze({ townhall: 0, timber: 1, claypit: 2, quarry: 3, warehouse: 4, workshop: 5, goldmine: 6, barracks: 7 });
export const TROOP_INDEX = Object.freeze({ spear: 0, archer: 1, rider: 2 });
export const BUILDING_IDS = Object.freeze(Object.keys(BUILDING_INDEX));
const TROOP_IDS = Object.freeze(Object.keys(TROOP_INDEX));
const GOLD_UNIT = 10n ** 18n;
const BASIS_POINTS = 10_000;
const PRESTIGE_BONUS_BPS = 1_000;
const FRACTION_SCALE = 86_400 * BASIS_POINTS;
const MAX_OFFLINE_SECONDS = 86_400;
const RESOURCE_BASE_DAILY_RATE = Object.freeze({ wood: 300, clay: 270, stone: 240, gold: 12 });
const monotonicNow = () => globalThis.performance?.now?.() ?? 0;

export const worldGameClient = createPublicClient({ transport: http(WORLD_CHAIN_MAINNET_RPC_URL) });

const tuple = (value, name, index) => value?.[name] ?? value?.[index] ?? 0n;
const number = (value) => Number(value ?? 0n);
const resourceTuple = (value) => ({ wood: number(tuple(value, 'wood', 0)), clay: number(tuple(value, 'clay', 1)), stone: number(tuple(value, 'stone', 2)), gold: number(tuple(value, 'gold', 3)) });
const buildingTuple = (value) => Object.fromEntries(BUILDING_IDS.map((id, index) => [id, number(tuple(value, id, index))]));
const troopTuple = (value) => Object.fromEntries(TROOP_IDS.map((id, index) => [id, number(tuple(value, id, index))]));

export function decodeCivilizationState(raw, goldBalance, accrual = null, chainTimestamp = null) {
  const registered = Boolean(raw?.[0]);
  const stored = resourceTuple(raw?.[3]);
  const field = resourceTuple(raw?.[4]);
  const buildings = buildingTuple(raw?.[5]);
  const troops = troopTuple(raw?.[6]);
  const raid = raw?.[7];
  const defender = tuple(raid, 'defender', 0);
  const build = raw?.[8];
  const pendingConstruction = Boolean(tuple(build, 'pending', 0));
  return {
    registered,
    resources: { ...stored, gold: Number(formatUnits(goldBalance ?? 0n, 18)) },
    unclaimed: field,
    buildings,
    troops,
    targets: [],
    raids: 0,
    lastRaid: null,
    gatherAvailableAt: number(raw?.[2]) * 1000,
    pendingRaid: defender && defender !== zeroAddress ? {
      kind: 'pvp',
      targetId: getAddress(defender),
      arrivesAt: number(tuple(raid, 'arrivesAt', 1)) * 1000,
      army: { spear: number(tuple(raid, 'spear', 2)), archer: number(tuple(raid, 'archer', 3)), rider: number(tuple(raid, 'rider', 4)) },
    } : null,
    construction: {
      pending: pendingConstruction,
      building: number(tuple(build, 'building', 1)),
      buildingId: BUILDING_IDS[number(tuple(build, 'building', 1))] || 'townhall',
      completesAt: number(tuple(build, 'completesAt', 2)) * 1000,
    },
    prestigeCount: number(raw?.[9]),
    last: number(raw?.[1]) * 1000,
    // These anchors deliberately contain no wall-clock time.  A display frame
    // advances chain `asOf` only by elapsed monotonic time after this read.
    chainTimestamp: chainTimestamp === null ? null : number(chainTimestamp) * 1000,
    performanceAnchor: monotonicNow(),
    // This is display-only precision.  Transactions always use the contract.
    accrual: accrual ? {
      wholeField: resourceTuple(accrual?.[0]),
      fractionalRemainder: resourceTuple(accrual?.[1]),
      fractionScale: number(accrual?.[2]),
      asOf: number(accrual?.[3]) * 1000,
    } : { wholeField: field, fractionalRemainder: { wood: 0, clay: 0, stone: 0, gold: 0 }, fractionScale: FRACTION_SCALE, asOf: chainTimestamp === null ? number(raw?.[1]) * 1000 : number(chainTimestamp) * 1000 },
  };
}

async function readRawState(account, includeGold = true, contractAddress = CIVILIZATION_GAME_ADDRESS) {
  const address = getAddress(account);
  const game = getAddress(contractAddress);
  // One block tag makes the player preview, CGOLD balance, and fractional
  // production snapshot a coherent read rather than a mixed-block UI state.
  const blockNumber = await worldGameClient.getBlockNumber();
  const [raw, gold, accrual, block] = await Promise.all([
    worldGameClient.readContract({ address: game, abi: CIVILIZATION_GAME_ABI, functionName: 'previewPlayerState', args: [address], blockNumber }),
    includeGold ? worldGameClient.readContract({ address: game, abi: CIVILIZATION_GAME_ABI, functionName: 'balanceOf', args: [address], blockNumber }) : 0n,
    // The existing live address intentionally does not expose this V1 proxy
    // method yet.  A missing selector is therefore a compatibility fallback.
    worldGameClient.readContract({ address: game, abi: CIVILIZATION_GAME_ABI, functionName: 'previewAccrual', args: [address], blockNumber }).catch(() => null),
    worldGameClient.getBlock({ blockNumber }),
  ]);
  return decodeCivilizationState(raw, gold, accrual, block.timestamp);
}

export async function readCivilizationState(account, contractAddress = CIVILIZATION_GAME_ADDRESS) {
  if (!isAddress(account)) throw new Error('invalid_wallet');
  return readRawState(account, true, contractAddress);
}

/** Reads the contract's exact upward-rounded construction duration. */
export async function readContractBuildDuration(buildingId, nextLevel, contractAddress = CIVILIZATION_GAME_ADDRESS) {
  if (!Object.hasOwn(BUILDING_INDEX, buildingId)) throw new Error('invalid_building');
  if (!Number.isInteger(nextLevel) || nextLevel < 1 || nextLevel > 30) throw new Error('invalid_building_level');
  return worldGameClient.readContract({
    address: getAddress(contractAddress), abi: CIVILIZATION_GAME_ABI, functionName: 'buildDuration',
    args: [BUILDING_INDEX[buildingId], BigInt(nextLevel)],
  });
}

/** Encodes the sole wallet-only player initialization call. */
export function encodeWalletRegistration(contractAddress = CIVILIZATION_GAME_ADDRESS) {
  return [transaction(getAddress(contractAddress), encodeFunctionData({ abi: CIVILIZATION_GAME_ABI, functionName: 'registerWallet' }))];
}

/**
 * Reads before every send, binds MiniKit's response to the SIWE-verified
 * checksum wallet, then requires both a successful receipt and readback.
 */
export async function registerWalletWithMiniKit({
  walletAddress,
  contractAddress = CIVILIZATION_GAME_ADDRESS,
  pollReceipt,
  readState = /** @type {((address: string) => Promise<{ registered: boolean, [key: string]: unknown }>) | undefined} */ (undefined),
  pendingUserOpHash = /** @type {string | null} */ (null),
  onPendingUserOpHash = /** @type {(hash: string | null) => void} */ (() => {}),
  miniKit = MiniKit,
}) {
  const wallet = getAddress(walletAddress);
  const game = getAddress(contractAddress);
  if (typeof pollReceipt !== 'function') throw new Error('receipt_poller_required');
  if (typeof onPendingUserOpHash !== 'function') throw new Error('pending_hash_handler_required');
  const getState = typeof readState === 'function'
    ? readState
    : (address) => readCivilizationState(address, game);
  const before = await getState(wallet);
  if (before.registered) {
    onPendingUserOpHash(null);
    return { state: before, alreadyRegistered: true };
  }

  let userOpHash = pendingUserOpHash;
  if (userOpHash !== null && !/^0x[0-9a-fA-F]{64}$/.test(userOpHash)) throw new Error('invalid_pending_user_op');
  if (userOpHash === null) {
    const response = await miniKit.sendTransaction({
      chainId: WORLD_CHAIN_ID,
      transactions: encodeWalletRegistration(game),
    });
    if (response.executedWith !== 'minikit') throw new Error('world_app_wallet_required');
    if (response.data?.status !== 'success' || !/^0x[0-9a-fA-F]{64}$/.test(response.data.userOpHash || '')) {
      throw new Error(response.data?.error_code || 'wallet_registration_rejected');
    }
    if (!isAddress(response.data.from) || getAddress(response.data.from) !== wallet) throw new Error('transaction_wallet_mismatch');
    userOpHash = response.data.userOpHash;
    onPendingUserOpHash(userOpHash);
  }
  let receiptResult;
  try {
    receiptResult = await pollReceipt(userOpHash);
  } catch (error) {
    if (error instanceof Error && error.message === 'Transaction failed') {
      onPendingUserOpHash(null);
      throw new Error('transaction_failed');
    }
    throw error;
  }
  const { receipt } = receiptResult;
  if (receipt?.status !== 'success') {
    onPendingUserOpHash(null);
    throw new Error('transaction_failed');
  }
  const after = await getState(wallet);
  if (!after.registered) throw new Error('wallet_registration_not_confirmed');
  onPendingUserOpHash(null);
  return { state: after, alreadyRegistered: false, userOpHash };
}

const baseCosts = Object.freeze({
  townhall: { values: [280, 260, 240, 0], factor: 160 },
  timber: { values: [35, 20, 15, 0], factor: 146 },
  claypit: { values: [25, 40, 20, 0], factor: 147 },
  quarry: { values: [30, 25, 45, 0], factor: 148 },
  warehouse: { values: [45, 45, 35, 0], factor: 152 },
  workshop: { values: [90, 110, 105, 15], factor: 160 },
  goldmine: { values: [130, 120, 150, 0], factor: 166 },
  barracks: { values: [125, 145, 105, 25], factor: 162 },
});

export function getContractBuildingCost(state, id) {
  const definition = baseCosts[id];
  if (!definition) throw new Error('invalid_building');
  const values = [...definition.values];
  for (let level = 0; level < (state.buildings[id] || 0); level += 1) {
    for (let index = 0; index < values.length; index += 1) values[index] = Math.ceil((values[index] * definition.factor) / 100);
  }
  return Object.fromEntries(['wood', 'clay', 'stone', 'gold'].map((resource, index) => [resource, values[index]]));
}

export function getContractRequirements(state, id) {
  const b = state.buildings;
  const next = (b[id] || 0) + 1;
  const required = [];
  const add = (building, level) => { if ((b[building] || 0) < level) required.push({ id: building, level }); };
  if (id === 'townhall') {
    add('timber', next); add('claypit', next); add('quarry', next);
    if (next >= 3) add('warehouse', next - 1);
    if (next >= 5) add('workshop', next - 3);
  } else if (id === 'warehouse') add('townhall', 1);
  else if (id === 'workshop') { add('townhall', 2); add('timber', 2); add('claypit', 2); add('quarry', 2); }
  else if (id === 'goldmine') { add('townhall', 4); add('workshop', 2); }
  else if (id === 'barracks') { add('townhall', 3); add('workshop', 1); }
  return required;
}

export function getContractTroopRequirements(state, id) {
  const required = [];
  if (state.buildings.barracks < ({ spear: 1, archer: 2, rider: 3 }[id] || 99)) required.push({ id: 'barracks', level: { spear: 1, archer: 2, rider: 3 }[id] || 99 });
  if (id === 'rider' && state.buildings.workshop < 2) required.push({ id: 'workshop', level: 2 });
  return required;
}

export function getContractCapacity(state) {
  let capacity = 500;
  for (let level = 1; level < (state.buildings.warehouse || 0); level += 1) capacity = Math.floor((capacity * 17 + 5) / 10);
  return capacity;
}

export function getContractProduction(state) {
  const multiplier = 1 + (state.prestigeCount || 0) * 0.1;
  return {
    wood: 300 * state.buildings.timber * multiplier,
    clay: 270 * state.buildings.claypit * multiplier,
    stone: 240 * state.buildings.quarry * multiplier,
    gold: 12 * state.buildings.goldmine * multiplier,
  };
}

/**
 * Display-only projection from a previewPlayerState snapshot.  The contract is
 * still the authority: this never mutates the snapshot and all actions reread
 * it after a confirmed receipt.  Each value is derived from the same anchor,
 * so repeated animation frames cannot compound rounding drift.
 */
export function projectCivilizationState(snapshot, performanceNow = monotonicNow()) {
  if (!snapshot?.registered || !Number.isFinite(snapshot.last)) return snapshot;
  const elapsedMs = Math.max(0, performanceNow - (snapshot.performanceAnchor ?? performanceNow));
  const elapsed = Math.min(MAX_OFFLINE_SECONDS, Math.floor(elapsedMs / 1000));
  const capacity = getContractCapacity(snapshot);
  const multiplierBps = BASIS_POINTS + (snapshot.prestigeCount || 0) * PRESTIGE_BONUS_BPS;
  const unclaimed = Object.fromEntries(Object.keys(RESOURCE_BASE_DAILY_RATE).map((resource) => {
    if (snapshot.accrual?.fractionScale) {
      const whole = snapshot.accrual.wholeField?.[resource] || 0;
      const remainder = snapshot.accrual.fractionalRemainder?.[resource] || 0;
      const seconds = elapsed;
      const building = ({ wood: 'timber', clay: 'claypit', stone: 'quarry', gold: 'goldmine' })[resource];
      const rate = RESOURCE_BASE_DAILY_RATE[resource] * (snapshot.buildings?.[building] || 0) * multiplierBps;
      return [resource, Math.min(capacity, whole + ((remainder + seconds * rate) / snapshot.accrual.fractionScale))];
    }
    const building = ({ wood: 'timber', clay: 'claypit', stone: 'quarry', gold: 'goldmine' })[resource];
    const rate = RESOURCE_BASE_DAILY_RATE[resource] * (snapshot.buildings?.[building] || 0) * multiplierBps;
    // previewPlayerState has already applied the contract's private remainder.
    // It is intentionally unavailable to clients, so this is a conservative
    // whole-unit continuation from that authoritative preview anchor.
    const produced = Math.floor((elapsed * rate) / FRACTION_SCALE);
    return [resource, Math.min(capacity, (snapshot.unclaimed?.[resource] || 0) + produced)];
  }));
  return { ...snapshot, unclaimed };
}

/** True only for a freshly block-anchored claim that can move whole units. */
export function claimEligibility(state) {
  if (!state?.registered || !Number.isFinite(state.chainTimestamp)) return false;
  if (state.chainTimestamp < (state.gatherAvailableAt || 0)) return false;
  const capacity = getContractCapacity(state);
  const transferable = ['wood', 'clay', 'stone'].some((resource) =>
    Math.min(state.unclaimed?.[resource] || 0, Math.max(0, capacity - (state.resources?.[resource] || 0))) >= 1,
  );
  // CGOLD has no warehouse limit and is independently claimable.
  return transferable || (state.unclaimed?.gold || 0) >= 1;
}

const transaction = (to, data) => ({ to, data, value: '0x0' });

export function encodeWorldGameAction(type, payload = {}, contractAddress = CIVILIZATION_GAME_ADDRESS) {
  const game = getAddress(contractAddress);
  if (type === 'claim') return [transaction(game, encodeFunctionData({ abi: CIVILIZATION_GAME_ABI, functionName: 'claim' }))];
  if (type === 'upgrade') {
    if (!Object.hasOwn(BUILDING_INDEX, payload.building)) throw new Error('invalid_building');
    return [transaction(game, encodeFunctionData({ abi: CIVILIZATION_GAME_ABI, functionName: 'upgrade', args: [BUILDING_INDEX[payload.building]] }))];
  }
  if (type === 'complete_upgrade') return [transaction(game, encodeFunctionData({ abi: CIVILIZATION_GAME_ABI, functionName: 'completeUpgrade' }))];
  if (type === 'prestige') return [transaction(game, encodeFunctionData({ abi: CIVILIZATION_GAME_ABI, functionName: 'prestige' }))];
  if (type === 'train') {
    if (!Object.hasOwn(TROOP_INDEX, payload.troop) || !Number.isSafeInteger(payload.amount) || payload.amount < 1) throw new Error('invalid_troop');
    return [transaction(game, encodeFunctionData({ abi: CIVILIZATION_GAME_ABI, functionName: 'train', args: [TROOP_INDEX[payload.troop], BigInt(payload.amount)] }))];
  }
  if (type === 'start_raid') {
    if (!isAddress(payload.targetId)) throw new Error('invalid_target');
    return [transaction(game, encodeFunctionData({
      abi: CIVILIZATION_GAME_ABI, functionName: 'startRaid',
      args: [getAddress(payload.targetId), BigInt(payload.army?.spear || 0), BigInt(payload.army?.archer || 0), BigInt(payload.army?.rider || 0)],
    }))];
  }
  if (type === 'resolve_raid') return [transaction(game, encodeFunctionData({ abi: CIVILIZATION_GAME_ABI, functionName: 'resolveRaid' }))];
  if (type === 'boost') {
    if (!Number.isSafeInteger(payload.hours) || payload.hours < 1) throw new Error('invalid_boost');
    const amount = BigInt(payload.hours) * GOLD_UNIT;
    return [
      transaction(WORLD_TOKEN_ADDRESS, encodeFunctionData({ abi: WORLD_TOKEN_ABI, functionName: 'approve', args: [game, amount] })),
      transaction(game, encodeFunctionData({ abi: CIVILIZATION_GAME_ABI, functionName: 'boostConstruction', args: [BigInt(payload.hours)] })),
    ];
  }
  throw new Error(type === 'swap' ? 'world_market_unavailable' : 'invalid_action');
}

export function createWorldGameAdapter({ walletAddress, contractAddress = CIVILIZATION_GAME_ADDRESS, pollReceipt, miniKit = MiniKit, readState: suppliedReadState = undefined, readBuildDuration: suppliedBuildDuration = undefined }) {
  const wallet = getAddress(walletAddress);
  const game = getAddress(contractAddress);
  if (typeof pollReceipt !== 'function') throw new Error('receipt_poller_required');
  let lastRaid = null;
  const readState = async () => {
    const current = suppliedReadState ? await suppliedReadState(wallet, game) : await readCivilizationState(wallet, game);
    if (!current.registered) throw new Error('world_registration_required');
    return { ...current, lastRaid };
  };
  let actionInFlight = null;
  const validUserOpHash = (hash) => typeof hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(hash);
  const pendingStorageKey = `civilization:pending-user-op:${wallet.toLowerCase()}:${game.toLowerCase()}`;
  const pendingStore = (() => { try { return globalThis.sessionStorage; } catch { return null; } })();
  const readPending = () => {
    try {
      const record = JSON.parse(pendingStore?.getItem(pendingStorageKey) || 'null');
      return record?.wallet?.toLowerCase() === wallet.toLowerCase() && record?.contract?.toLowerCase() === game.toLowerCase()
        && typeof record.action === 'string' && validUserOpHash(record.userOpHash) ? record : null;
    } catch { return null; }
  };
  const persistPending = (action, userOpHash) => {
    if (!action || !userOpHash) { try { pendingStore?.removeItem(pendingStorageKey); } catch {} return; }
    try { pendingStore?.setItem(pendingStorageKey, JSON.stringify({ wallet, contract: game, action, userOpHash })); } catch {}
  };
  const restoredPending = readPending();
  let pendingUserOpHash = restoredPending?.userOpHash || null;
  let pendingAction = restoredPending?.action || null;
  // Keep the production default bound to MiniKit while allowing deterministic
  // adapter tests to supply the same narrow transaction surface.
  const sendTransaction = miniKit === MiniKit ? MiniKit.sendTransaction.bind(MiniKit) : miniKit.sendTransaction.bind(miniKit);
  const executeAction = async (type, payload) => {
    if (pendingUserOpHash && pendingAction !== type) throw new Error('transaction_pending');
    if (type === 'claim' && !pendingUserOpHash) {
      // Read immediately before MiniKit.  This avoids a wallet prompt for a
      // zero/cooldown/full-storage claim and is never based on animated UI.
      const preflight = await readState();
      if (!claimEligibility(preflight)) throw new Error('claim_not_available');
    }
    const raidBefore = type === 'resolve_raid' && !pendingUserOpHash ? await readRawState(wallet, false, game) : null;
    if (type === 'start_raid' && !pendingUserOpHash) {
      const target = getAddress(payload.targetId);
      if (target === wallet) throw new Error('self_raid');
      if (!(await readRawState(target, false, game)).registered) throw new Error('target_not_registered');
    }
    let userOpHash = pendingUserOpHash;
    if (!userOpHash) {
      const response = await sendTransaction({ chainId: WORLD_CHAIN_ID, transactions: encodeWorldGameAction(type, payload, game) });
      if (response.executedWith !== 'minikit') throw new Error('world_app_wallet_required');
      if (response.data?.status !== 'success' || !validUserOpHash(response.data.userOpHash)) throw new Error(response.data?.error_code || 'transaction_rejected');
      if (!isAddress(response.data.from) || getAddress(response.data.from) !== wallet) throw new Error('transaction_wallet_mismatch');
      userOpHash = response.data.userOpHash;
      pendingUserOpHash = userOpHash;
      pendingAction = type;
      persistPending(type, userOpHash);
    }
    let receipt;
    try {
      ({ receipt } = await pollReceipt(userOpHash));
    } catch (error) {
      if (error instanceof Error && error.message === 'receipt_timeout') return { state: await readState(), pending: true, userOpHash };
      if (error instanceof Error && error.message === 'Transaction failed') {
        pendingUserOpHash = null;
        pendingAction = null;
        persistPending(null, null);
        throw new Error('transaction_failed');
      }
      throw error;
    }
    if (receipt?.status !== 'success') {
      pendingUserOpHash = null;
      pendingAction = null;
      persistPending(null, null);
      throw new Error('transaction_failed');
    }
    if (type === 'resolve_raid') {
      const resolved = parseEventLogs({ abi: CIVILIZATION_GAME_ABI, eventName: 'RaidResolved', logs: receipt.logs, strict: false })
        .find((event) => getAddress(event.args.attacker) === wallet);
      if (resolved) {
        const won = resolved.args.attackerWon;
        const rate = won ? 8 : 38;
        const casualties = Object.fromEntries(TROOP_IDS.map((id) => [id, Math.ceil((raidBefore?.pendingRaid?.army?.[id] || 0) * rate / 100)]));
        lastRaid = { ok: won, target: getAddress(resolved.args.defender), attack: Number(resolved.args.attack), defense: Number(resolved.args.defense), casualties, stolen: { wood: Number(resolved.args.wood), clay: Number(resolved.args.clay), stone: Number(resolved.args.stone), gold: Number(resolved.args.gold) } };
      }
    }
    pendingUserOpHash = null;
    pendingAction = null;
    persistPending(null, null);
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
    readBuildDuration(buildingId, nextLevel) { return suppliedBuildDuration ? suppliedBuildDuration(buildingId, nextLevel, game) : readContractBuildDuration(buildingId, nextLevel, game); },
    hasPending() { return Boolean(pendingUserOpHash && pendingAction); },
    pending() { return pendingUserOpHash ? { wallet, contract: game, action: pendingAction, userOpHash: pendingUserOpHash } : null; },
    async resumePending() {
      if (!pendingUserOpHash || !pendingAction) return null;
      return adapter.execute(pendingAction);
    },
    readState,
    async pickOpponent() {
      const result = await miniKit.shareContacts({ isMultiSelectEnabled: false });
      if (result.executedWith !== 'minikit' || !result.data?.contacts?.length) throw new Error('contact_not_selected');
      const contact = result.data.contacts[0];
      const address = getAddress(contact.walletAddress);
      if (address === wallet) throw new Error('self_raid');
      const target = await readRawState(address, false, game);
      if (!target.registered) throw new Error('target_not_registered');
      return { address, username: contact.username || address };
    },
    async execute(type, payload = {}) {
      if (actionInFlight) {
        if (pendingAction !== type && actionInFlight.type !== type) throw new Error('transaction_pending');
        return actionInFlight.promise;
      }
      const promise = executeAction(type, payload).finally(() => { actionInFlight = null; });
      actionInFlight = { type, promise };
      return promise;
    },
  };
  return adapter;
}
