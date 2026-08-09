import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, gather, getRequirements, sendRaid, settle, swapInternal, trainTroop, upgradeBuilding } from "../src/game.js";

test("resource buildings fill raidable field stock before collection", () => {
  const state = createInitialState(0);
  const beforeWood = state.resources.wood;
  settle(state, 10_000);
  assert.equal(state.resources.wood, beforeWood);
  assert.ok(state.unclaimed.wood > 0);
});

test("collection moves field stock into the protected storage", () => {
  const state = createInitialState(0);
  settle(state, 10_000);
  const beforeWood = state.resources.wood;
  const beforeFieldWood = state.unclaimed.wood;
  const result = gather(state, 10_000);
  assert.ok(result.collected.wood > 0);
  assert.equal(state.resources.wood, beforeWood + beforeFieldWood);
  assert.equal(state.unclaimed.wood, 0);
});

test("field stock cannot pay building costs before collection", () => {
  const state = createInitialState(0);
  state.resources = { wood: 0, clay: 0, stone: 0, gold: 0 };
  settle(state, 3_600_000);
  assert.ok(state.unclaimed.wood > 0);
  assert.equal(upgradeBuilding(state, "timber", 3_600_000).reason, "resources");
  gather(state, 3_600_000);
  assert.equal(upgradeBuilding(state, "timber", 3_600_000).ok, true);
});

test("Rathaus level 2 requires each primary resource building at level 2", () => {
  const state = createInitialState(0);
  const missing = getRequirements(state, "townhall");
  assert.equal(missing.length, 3);
  assert.equal(upgradeBuilding(state, "townhall", 0).reason, "requirements");
});

test("training is locked until the barracks requirement is met", () => {
  const state = createInitialState(0);
  assert.equal(trainTroop(state, "spear", 1, 0).reason, "requirements");
});

test("a winning raid transfers resources and removes some troops", () => {
  const state = createInitialState(0);
  state.troops.spear = 6;
  const beforeWood = state.resources.wood;
  const target = state.targets.find((item) => item.id === "river");
  const beforeTargetWood = target.unclaimed.wood;
  const result = sendRaid(state, "river", { spear: 6, archer: 0, rider: 0 }, 0);
  assert.equal(result.ok, true);
  assert.equal(result.ok, result.attack >= result.defense);
  assert.ok(state.resources.wood > beforeWood);
  assert.ok(target.unclaimed.wood < beforeTargetWood);
  assert.ok(state.troops.spear < 6);
});

test("only non-gold resources can use the local market", () => {
  const state = createInitialState(0);
  const clayBefore = state.resources.clay;
  assert.equal(swapInternal(state, "wood", "clay", 20, 0).ok, true);
  assert.ok(state.resources.clay > clayBefore);
  assert.equal(swapInternal(state, "gold", "wood", 5, 0).reason, "market");
});
