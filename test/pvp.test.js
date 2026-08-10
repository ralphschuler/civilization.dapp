import test from "node:test";
import assert from "node:assert/strict";
import { MARCH_DURATION_MS, createInitialState, getCapacity } from "../src/game.js";
import { idempotentMutation } from "../server/game-state.js";
import { publicTarget, resolvePvpRaid, seedCommit, startPvpRaid, validatePublicVillageId } from "../server/pvp.js";

const attackerId = "v_AttackerOpaqueVillage001";
const defenderId = "v_DefenderOpaqueVillage001";

function village() {
  const state = createInitialState(0);
  state.buildings.timber = 0;
  state.buildings.claypit = 0;
  state.buildings.quarry = 0;
  return state;
}

test("PvP directory exposes only opaque public village data", () => {
  const state = village();
  const anonymousBrowserId = "browser-private-id-must-never-be-public";
  const target = publicTarget(defenderId, state);
  assert.equal(validatePublicVillageId(defenderId), true);
  assert.equal(JSON.stringify(target).includes(anonymousBrowserId), false);
  assert.equal(Object.hasOwn(target, "anonymous_id"), false);
  assert.equal(Object.hasOwn(target, "resources"), false);
  assert.equal(target.id, defenderId);
});

test("a player cannot start a PvP raid against their own public village", () => {
  const state = village();
  state.troops.spear = 1;
  assert.deepEqual(startPvpRaid(state, attackerId, attackerId, { spear: 1, archer: 0, rider: 0 }, 0), { ok: false, reason: "target" });
  assert.equal(state.pendingRaid, null);
});

test("PvP loot conserves field stock and never touches protected storage", () => {
  const attacker = village();
  const defender = village();
  attacker.troops.spear = 100;
  defender.resources = { wood: 777, clay: 666, stone: 555, gold: 44 };
  defender.unclaimed = { wood: 30, clay: 20, stone: 10, gold: 5 };
  const protectedBefore = { ...defender.resources };
  const start = startPvpRaid(attacker, attackerId, defenderId, { spear: 100, archer: 0, rider: 0 }, 0, Buffer.alloc(32, 1));
  assert.equal(start.ok, true);
  const attackerBefore = { ...attacker.resources };
  const fieldBefore = { ...defender.unclaimed };
  const result = resolvePvpRaid(attacker, defender, attackerId, defenderId, MARCH_DURATION_MS, Buffer.alloc(32, 1));
  assert.equal(result.ok, true);
  for (const resource of Object.keys(fieldBefore)) {
    assert.equal(attacker.resources[resource] - attackerBefore[resource], result.stolen[resource]);
    assert.equal(defender.unclaimed[resource] + result.stolen[resource], fieldBefore[resource]);
  }
  assert.deepEqual(defender.resources, protectedBefore);
});

test("PvP raid seeds are committed before the outcome and loot respects total capacity", () => {
  const attacker = village();
  const defender = village();
  attacker.resources = { wood: 99, clay: 0, stone: 0, gold: 0 };
  attacker.buildings.warehouse = 1;
  attacker.troops.spear = 1;
  defender.unclaimed = { wood: 100, clay: 100, stone: 100, gold: 100 };
  const seed = Buffer.alloc(32, 7);
  const started = startPvpRaid(attacker, attackerId, defenderId, { spear: 1, archer: 0, rider: 0 }, 0, seed);
  assert.equal(started.seed, undefined);
  assert.equal(started.seedCommit, seedCommit(seed));
  const resolved = resolvePvpRaid(attacker, defender, attackerId, defenderId, MARCH_DURATION_MS, seed);
  assert.equal(resolved.seedCommit, seedCommit(seed));
  assert.equal(resolved.seed, seed.toString("base64url"));
  const totalResources = Object.values(attacker.resources).reduce((total, amount) => total + amount, 0);
  assert.ok(totalResources <= getCapacity(attacker));
});

test("replaying a PvP resolution action cannot move loot twice", () => {
  const attacker = village();
  const defender = village();
  attacker.troops.spear = 100;
  defender.unclaimed = { wood: 40, clay: 0, stone: 0, gold: 0 };
  startPvpRaid(attacker, attackerId, defenderId, { spear: 100, archer: 0, rider: 0 }, 0, Buffer.alloc(32, 2));
  const cache = new Map();
  const run = () => ({ result: resolvePvpRaid(attacker, defender, attackerId, defenderId, MARCH_DURATION_MS, Buffer.alloc(32, 2)), wood: attacker.resources.wood, defenderWood: defender.unclaimed.wood });
  const first = idempotentMutation(cache, "p".repeat(16), run);
  const second = idempotentMutation(cache, "p".repeat(16), run);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.wood, first.wood);
  assert.equal(second.defenderWood, first.defenderWood);
});
