import test from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_COOLDOWN_MS,
  MARCH_DURATION_MS,
  createInitialState,
  gather,
  getBuildingCost,
  getRequirements,
  resolveRaidMarch,
  sendRaid,
  settle,
  startGathering,
  startRaidMarch,
  swapInternal,
  trainTroop,
  upgradeBuilding,
} from "../src/game.js";

test("demo workshop bootstrap waives CGOLD without changing primary resources", () => {
  const state = createInitialState(0);
  state.buildings = {
    ...state.buildings,
    townhall: 2,
    timber: 2,
    claypit: 2,
    quarry: 2,
  };
  assert.deepEqual(getBuildingCost(state, "workshop"), {
    wood: 90,
    clay: 110,
    stone: 105,
    gold: 0,
  });
});

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

test("collection locks for one minute after gathering", () => {
  const state = createInitialState(0);
  settle(state, 10_000);
  assert.equal(startGathering(state, 10_000).ok, true);
  assert.equal(state.gatherAvailableAt, 10_000 + COLLECTION_COOLDOWN_MS);
  assert.equal(startGathering(state, 10_001).reason, "cooldown");
  assert.equal(startGathering(state, 10_000 + COLLECTION_COOLDOWN_MS).ok, true);
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
  assert.equal(getRequirements(state, "townhall").length, 3);
  assert.equal(upgradeBuilding(state, "townhall", 0).reason, "requirements");
});

test("training is locked until the barracks requirement is met", () => {
  assert.equal(
    trainTroop(createInitialState(0), "spear", 1, 0).reason,
    "requirements",
  );
});

test("a winning raid transfers resources and removes some troops", () => {
  const state = createInitialState(0);
  state.troops.spear = 6;
  const target = state.targets.find((item) => item.id === "river");
  const beforeWood = state.resources.wood;
  const beforeTargetWood = target.unclaimed.wood;
  const result = sendRaid(state, "river", { spear: 6, archer: 0, rider: 0 }, 0);
  assert.equal(result.ok, true);
  assert.equal(result.ok, result.attack >= result.defense);
  assert.ok(state.resources.wood > beforeWood);
  assert.ok(target.unclaimed.wood < beforeTargetWood);
  assert.ok(state.troops.spear < 6);
});

test("a raid resolves only after its one-minute march and blocks another march", () => {
  const state = createInitialState(0);
  state.troops.spear = 6;
  const first = startRaidMarch(
    state,
    "river",
    { spear: 6, archer: 0, rider: 0 },
    10_000,
  );
  assert.equal(first.ok, true);
  assert.equal(first.arrivesAt, 10_000 + MARCH_DURATION_MS);
  assert.equal(
    startRaidMarch(state, "river", { spear: 1, archer: 0, rider: 0 }, 10_001)
      .reason,
    "march",
  );
  assert.equal(resolveRaidMarch(state, first.arrivesAt - 1).reason, "march");
  assert.equal(resolveRaidMarch(state, first.arrivesAt).ok, true);
  assert.equal(state.pendingRaid, null);
  assert.equal(state.raids, 1);
});

test("only non-gold resources can use the local market", () => {
  const state = createInitialState(0);
  const clayBefore = state.resources.clay;
  assert.equal(swapInternal(state, "wood", "clay", 20, 0).ok, true);
  assert.ok(state.resources.clay > clayBefore);
  assert.equal(swapInternal(state, "gold", "wood", 5, 0).reason, "market");
});
