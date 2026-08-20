import test from "node:test";
import assert from "node:assert/strict";
import { planBuildingDependencies } from "../src/world-game/build-planner.js";
import { buildPanel } from "../src/game-ui/views/build.js";
import {
  getContractBuildingCost,
  getContractConstructionCapacity,
  getContractRequirementsForLevel,
} from "../src/world-game/projections.js";

const baseState = (overrides = {}) => ({
  chainTimestamp: 1_000_000,
  resources: { wood: 100_000, clay: 100_000, stone: 100_000, gold: 100_000 },
  buildings: {
    townhall: 1,
    timber: 1,
    claypit: 1,
    quarry: 1,
    warehouse: 0,
    workshop: 0,
    goldmine: 0,
    barracks: 0,
  },
  constructions: [],
  ...overrides,
});

function plan(state, target, rules = getContractRequirementsForLevel) {
  return planBuildingDependencies({
    state,
    target,
    requirementsForLevel: rules,
    buildingCost: getContractBuildingCost,
    buildDuration: (_id, level) => level * 120,
    constructionCapacity: getContractConstructionCapacity,
  });
}

test("planner expands contract-parity prerequisite branches in deterministic topological order", () => {
  const result = plan(baseState(), { id: "workshop", level: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.steps.map(({ id, level }) => `${id}:${level}`),
    ["claypit:2", "quarry:2", "timber:2", "townhall:2", "workshop:1"],
  );
  assert.equal(result.next.key, "claypit:2");
  assert.deepEqual(result, plan(baseState(), { id: "workshop", level: 1 }));
});

test("planner reserves active jobs and only exposes a presently independent next step", () => {
  const state = baseState({
    buildings: {
      townhall: 3,
      timber: 1,
      claypit: 1,
      quarry: 1,
      warehouse: 0,
      workshop: 11,
      goldmine: 0,
      barracks: 0,
    },
    constructions: [
      { pending: true, buildingId: "timber", slot: 0, completesAt: 1_100_000 },
    ],
  });
  const result = plan(state, { id: "barracks", level: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.next.key, "barracks:1");
  assert.equal(result.next.slot, 1);
});

test("planner fails closed for cycles, missing duration data, and rule changes", () => {
  const cycle = plan(baseState(), { id: "timber", level: 2 }, (id, level) =>
    id === "timber" && level === 2
      ? [{ id: "townhall", level: 2 }]
      : [{ id: "timber", level: 2 }],
  );
  assert.equal(cycle.ok, false);
  assert.equal(cycle.reason, "dependency_cycle");
  const changed = plan(baseState(), { id: "timber", level: 2 }, (id) =>
    id === "timber" ? [{ id: "warehouse", level: 1 }] : [],
  );
  assert.equal(changed.ok, true);
  assert.equal(changed.steps.at(-1).key, "timber:2");
  const unavailable = planBuildingDependencies({
    state: baseState(),
    target: { id: "timber", level: 2 },
    requirementsForLevel: () => [],
    buildingCost: getContractBuildingCost,
    buildDuration: () => undefined,
    constructionCapacity: getContractConstructionCapacity,
  });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, "duration_unavailable");
});

test("planner reports resource deficits without reserving or dispatching later steps", () => {
  const result = plan(
    baseState({ resources: { wood: 0, clay: 0, stone: 0, gold: 0 } }),
    { id: "timber", level: 2 },
  );
  assert.equal(result.ok, true);
  assert.equal(result.next, null);
  assert.deepEqual(result.steps[0].deficits, { wood: 52, clay: 30, stone: 22 });
});

test("planner UI renders one review-bound next-step control, never a batch action", () => {
  const state = baseState();
  const result = plan(state, { id: "workshop", level: 1 });
  const buildings = Object.fromEntries(
    [
      "townhall",
      "timber",
      "claypit",
      "quarry",
      "warehouse",
      "workshop",
      "goldmine",
      "barracks",
    ].map((id) => [id, { label: id, detail: id, produces: {} }]),
  );
  const html = buildPanel({
    state,
    selectedBuilding: "workshop",
    buildings,
    requirements: () => [{ id: "townhall", level: 2 }],
    buildingCost: (id) => getContractBuildingCost(state, id),
    runtimeMode: "world",
    resourceDefs: Object.fromEntries(
      ["wood", "clay", "stone", "gold"].map((id) => [id, { label: id }]),
    ),
    format: String,
    buildDuration: (_id, level) => level * 120,
    nextBuildingProduction: () => ({}),
    remainingTime: () => 0,
    busy: false,
    buildingPlan: () => result,
  });
  assert.equal((html.match(/data-plan-upgrade=/g) || []).length, 1);
  assert.match(html, /data-plan-upgrade="claypit"/);
  assert.doesNotMatch(html, /data-plan-upgrade="[^" ]+"[^>]*data-plan-upgrade/);
});
