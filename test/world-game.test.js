import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, getAddress, toFunctionSelector, zeroAddress } from 'viem';
import { CIVILIZATION_GAME_ABI, WORLD_TOKEN_ABI } from '../src/abi/CivilizationGame.js';
import {
  BUILDING_INDEX,
  CIVILIZATION_GAME_ADDRESS,
  TROOP_INDEX,
  WORLD_TOKEN_ADDRESS,
  decodeCivilizationState,
  encodeWorldGameAction,
} from '../src/world-game.js';

const defender = '0x2222222222222222222222222222222222222222';

function functionSelector(signature) {
  return toFunctionSelector(signature);
}

test('Civilization contract state decodes CGOLD and chain timestamps for the UI', () => {
  const raw = [
    true,
    1_700_000_001n,
    1_700_000_222n,
    { wood: 81n, clay: 82n, stone: 83n, gold: 999n },
    [11n, 12n, 13n, 14n],
    [4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n],
    { spear: 21n, archer: 22n, rider: 23n },
    { defender, arrivesAt: 1_700_000_333n, spear: 3n, archer: 2n, rider: 1n },
    { pending: true, building: BUILDING_INDEX.goldmine, completesAt: 1_700_000_444n },
    3n,
  ];

  const state = decodeCivilizationState(raw, 12_345_000_000_000_000_000n);

  assert.equal(state.registered, true);
  assert.deepEqual(state.resources, { wood: 81, clay: 82, stone: 83, gold: 12.345 });
  assert.deepEqual(state.unclaimed, { wood: 11, clay: 12, stone: 13, gold: 14 });
  assert.deepEqual(state.buildings, {
    townhall: 4, timber: 5, claypit: 6, quarry: 7,
    warehouse: 8, workshop: 9, goldmine: 10, barracks: 11,
  });
  assert.deepEqual(state.troops, { spear: 21, archer: 22, rider: 23 });
  assert.deepEqual(state.pendingRaid, {
    kind: 'pvp',
    targetId: getAddress(defender),
    arrivesAt: 1_700_000_333_000,
    army: { spear: 3, archer: 2, rider: 1 },
  });
  assert.deepEqual(state.construction, {
    pending: true,
    building: BUILDING_INDEX.goldmine,
    buildingId: 'goldmine',
    completesAt: 1_700_000_444_000,
  });
  assert.equal(state.gatherAvailableAt, 1_700_000_222_000);
  assert.equal(state.last, 1_700_000_001_000);
  assert.equal(state.prestigeCount, 3);
  assert.deepEqual(state.targets, []);
  assert.equal(state.raids, 0);
  assert.equal(state.lastRaid, null);
});

test('empty on-chain raid and construction tuples remain inactive', () => {
  const raw = [
    true, 1n, 2n,
    [3n, 4n, 5n, 6n],
    [7n, 8n, 9n, 10n],
    [0n, 1n, 1n, 1n, 1n, 0n, 0n, 0n],
    [0n, 0n, 0n],
    [zeroAddress, 0n, 0n, 0n, 0n],
    [false, 0, 0n],
    0n,
  ];

  const state = decodeCivilizationState(raw, 0n);
  assert.equal(state.pendingRaid, null);
  assert.deepEqual(state.construction, {
    pending: false,
    building: 0,
    buildingId: 'townhall',
    completesAt: 0,
  });
});

test('every single-call Civilization action uses its deployed ABI selector and arguments', () => {
  const cases = [
    { type: 'claim', signature: 'claim()', functionName: 'claim', payload: {} },
    {
      type: 'upgrade', signature: 'upgrade(uint8)', functionName: 'upgrade',
      payload: { building: 'barracks' }, expectedArgs: [BUILDING_INDEX.barracks],
    },
    { type: 'complete_upgrade', signature: 'completeUpgrade()', functionName: 'completeUpgrade', payload: {} },
    { type: 'prestige', signature: 'prestige()', functionName: 'prestige', payload: {} },
    {
      type: 'train', signature: 'train(uint8,uint256)', functionName: 'train',
      payload: { troop: 'rider', amount: 3 }, expectedArgs: [TROOP_INDEX.rider, 3n],
    },
    {
      type: 'start_raid', signature: 'startRaid(address,uint256,uint256,uint256)', functionName: 'startRaid',
      payload: { targetId: defender, army: { spear: 4, archer: 5, rider: 6 } },
      expectedArgs: [getAddress(defender), 4n, 5n, 6n],
    },
    { type: 'resolve_raid', signature: 'resolveRaid()', functionName: 'resolveRaid', payload: {} },
  ];

  for (const item of cases) {
    const transactions = encodeWorldGameAction(item.type, item.payload);
    assert.equal(transactions.length, 1, `${item.type} must be one contract call`);
    assert.equal(getAddress(transactions[0].to), getAddress(CIVILIZATION_GAME_ADDRESS));
    assert.equal(transactions[0].value, '0x0');
    assert.equal(transactions[0].data.slice(0, 10), functionSelector(item.signature));
    const decoded = decodeFunctionData({ abi: CIVILIZATION_GAME_ABI, data: transactions[0].data });
    assert.equal(decoded.functionName, item.functionName);
    assert.deepEqual(decoded.args ?? [], item.expectedArgs ?? []);
  }
});

test('construction boost batches exact WLD approval before boostConstruction', () => {
  const transactions = encodeWorldGameAction('boost', { hours: 2 });
  const amount = 2n * 10n ** 18n;

  assert.equal(transactions.length, 2);
  assert.equal(getAddress(transactions[0].to), getAddress(WORLD_TOKEN_ADDRESS));
  assert.equal(transactions[0].data.slice(0, 10), functionSelector('approve(address,uint256)'));
  assert.equal(transactions[0].value, '0x0');
  assert.deepEqual(
    decodeFunctionData({ abi: WORLD_TOKEN_ABI, data: transactions[0].data }),
    { functionName: 'approve', args: [getAddress(CIVILIZATION_GAME_ADDRESS), amount] },
  );

  assert.equal(getAddress(transactions[1].to), getAddress(CIVILIZATION_GAME_ADDRESS));
  assert.equal(transactions[1].data.slice(0, 10), functionSelector('boostConstruction(uint256)'));
  assert.equal(transactions[1].value, '0x0');
  assert.deepEqual(
    decodeFunctionData({ abi: CIVILIZATION_GAME_ABI, data: transactions[1].data }),
    { functionName: 'boostConstruction', args: [2n] },
  );
});

test('World contract adapter refuses local market swaps and malformed actions', () => {
  assert.throws(() => encodeWorldGameAction('swap', { from: 'wood', to: 'clay', amount: 1 }), /world_market_unavailable/);
  assert.throws(() => encodeWorldGameAction('unknown'), /invalid_action/);
  assert.throws(() => encodeWorldGameAction('boost', { hours: 0 }), /invalid_boost/);
  assert.throws(() => encodeWorldGameAction('upgrade', { building: 'market' }), /invalid_building/);
  assert.throws(() => encodeWorldGameAction('train', { troop: 'spear', amount: 1.5 }), /invalid_troop/);
});
