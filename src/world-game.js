import { MiniKit } from '@worldcoin/minikit-js';
import { createPublicClient, encodeFunctionData, formatUnits, getAddress, http, isAddress, parseEventLogs, zeroAddress } from 'viem';
import { CIVILIZATION_GAME_ABI, WORLD_TOKEN_ABI } from './abi/CivilizationGame.js';
import { WORLD_CHAIN_ID, WORLD_CHAIN_MAINNET_RPC_URL } from './world.js';

export const CIVILIZATION_GAME_ADDRESS = '0x1A64F89881FD2E38255E62c6D62b68076052DF4b';
export const WORLD_TOKEN_ADDRESS = '0x2cFc85d8E48F8EAB294be644d9E25C3030863003';
export const BUILDING_INDEX = Object.freeze({ townhall: 0, timber: 1, claypit: 2, quarry: 3, warehouse: 4, workshop: 5, goldmine: 6, barracks: 7 });
export const TROOP_INDEX = Object.freeze({ spear: 0, archer: 1, rider: 2 });
export const BUILDING_IDS = Object.freeze(Object.keys(BUILDING_INDEX));
const TROOP_IDS = Object.freeze(Object.keys(TROOP_INDEX));
const GOLD_UNIT = 10n ** 18n;

export const worldGameClient = createPublicClient({ transport: http(WORLD_CHAIN_MAINNET_RPC_URL) });

const tuple = (value, name, index) => value?.[name] ?? value?.[index] ?? 0n;
const number = (value) => Number(value ?? 0n);
const resourceTuple = (value) => ({ wood: number(tuple(value, 'wood', 0)), clay: number(tuple(value, 'clay', 1)), stone: number(tuple(value, 'stone', 2)), gold: number(tuple(value, 'gold', 3)) });
const buildingTuple = (value) => Object.fromEntries(BUILDING_IDS.map((id, index) => [id, number(tuple(value, id, index))]));
const troopTuple = (value) => Object.fromEntries(TROOP_IDS.map((id, index) => [id, number(tuple(value, id, index))]));

export function decodeCivilizationState(raw, goldBalance) {
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
  };
}

async function readRawState(account, includeGold = true) {
  const address = getAddress(account);
  const [raw, gold] = await Promise.all([
    worldGameClient.readContract({ address: CIVILIZATION_GAME_ADDRESS, abi: CIVILIZATION_GAME_ABI, functionName: 'previewPlayerState', args: [address] }),
    includeGold ? worldGameClient.readContract({ address: CIVILIZATION_GAME_ADDRESS, abi: CIVILIZATION_GAME_ABI, functionName: 'balanceOf', args: [address] }) : 0n,
  ]);
  return decodeCivilizationState(raw, gold);
}

export async function readCivilizationState(account) {
  if (!isAddress(account)) throw new Error('invalid_wallet');
  return readRawState(account);
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

const transaction = (to, data) => ({ to, data, value: '0x0' });

export function encodeWorldGameAction(type, payload = {}) {
  const game = CIVILIZATION_GAME_ADDRESS;
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

export function createWorldGameAdapter({ walletAddress, pollReceipt }) {
  const wallet = getAddress(walletAddress);
  if (typeof pollReceipt !== 'function') throw new Error('receipt_poller_required');
  let lastRaid = null;
  const readState = async () => {
    const current = await readCivilizationState(wallet);
    if (!current.registered) throw new Error('world_registration_required');
    return { ...current, lastRaid };
  };
  const adapter = {
    getBuildingCost: getContractBuildingCost,
    getRequirements: getContractRequirements,
    getTroopRequirements: getContractTroopRequirements,
    getCapacity: getContractCapacity,
    getProduction: getContractProduction,
    readState,
    async pickOpponent() {
      const result = await MiniKit.shareContacts({ isMultiSelectEnabled: false });
      if (result.executedWith !== 'minikit' || !result.data?.contacts?.length) throw new Error('contact_not_selected');
      const contact = result.data.contacts[0];
      const address = getAddress(contact.walletAddress);
      if (address === wallet) throw new Error('self_raid');
      const target = await readRawState(address, false);
      if (!target.registered) throw new Error('target_not_registered');
      return { address, username: contact.username || address };
    },
    async execute(type, payload = {}) {
      const raidBefore = type === 'resolve_raid' ? await readRawState(wallet, false) : null;
      if (type === 'start_raid') {
        const target = getAddress(payload.targetId);
        if (target === wallet) throw new Error('self_raid');
        if (!(await readRawState(target, false)).registered) throw new Error('target_not_registered');
      }
      const response = await MiniKit.sendTransaction({ chainId: WORLD_CHAIN_ID, transactions: encodeWorldGameAction(type, payload) });
      if (response.executedWith !== 'minikit') throw new Error('world_app_wallet_required');
      if (response.data?.status !== 'success' || !response.data.userOpHash) throw new Error(response.data?.error_code || 'transaction_rejected');
      if (!isAddress(response.data.from) || getAddress(response.data.from) !== wallet) throw new Error('transaction_wallet_mismatch');
      let pending = false;
      try {
        const { receipt } = await pollReceipt(response.data.userOpHash);
        if (receipt.status !== 'success') throw new Error('transaction_failed');
        if (type === 'resolve_raid') {
          const resolved = parseEventLogs({ abi: CIVILIZATION_GAME_ABI, eventName: 'RaidResolved', logs: receipt.logs, strict: false })
            .find((event) => getAddress(event.args.attacker) === wallet);
          if (resolved) {
            const won = resolved.args.attackerWon;
            const rate = won ? 8 : 38;
            const casualties = Object.fromEntries(TROOP_IDS.map((id) => [id, Math.ceil((raidBefore?.pendingRaid?.army?.[id] || 0) * rate / 100)]));
            lastRaid = {
              ok: won,
              target: getAddress(resolved.args.defender),
              attack: Number(resolved.args.attack),
              defense: Number(resolved.args.defense),
              casualties,
              stolen: {
                wood: Number(resolved.args.wood), clay: Number(resolved.args.clay),
                stone: Number(resolved.args.stone), gold: Number(resolved.args.gold),
              },
            };
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'receipt_timeout') pending = true;
        else throw error;
      }
      return { state: await readState(), pending, userOpHash: response.data.userOpHash };
    },
  };
  return adapter;
}
