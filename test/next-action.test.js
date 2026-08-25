import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveEntryGuide,
  deriveNextAction,
} from "../src/game-ui/next-action.js";

const base = {
  collection: { locked: true, unclaimed: {} },
  jobs: [],
  remainingTime: () => 1,
  level: 1,
  maxLevel: 25,
  requirements: [],
  affordable: true,
  atCapacity: false,
};

test("next action prioritizes claimable field resources over every build action", () => {
  assert.deepEqual(
    deriveNextAction({
      ...base,
      collection: { locked: false, unclaimed: { wood: 20 } },
      jobs: [{ slot: 0, completesAt: 0 }],
    }),
    { kind: "collect" },
  );
});
test("next action completes ready construction before starting an upgrade", () => {
  assert.deepEqual(
    deriveNextAction({
      ...base,
      jobs: [{ slot: 1, completesAt: 0 }],
      remainingTime: () => 0,
    }),
    { kind: "complete", slot: 1 },
  );
});

test("next action reports the concrete build blocker in priority order", () => {
  assert.equal(
    deriveNextAction({ ...base, requirements: [{ id: "townhall", level: 2 }] })
      .kind,
    "requirements",
  );
  assert.equal(
    deriveNextAction({ ...base, atCapacity: true }).kind,
    "capacity",
  );
  assert.equal(
    deriveNextAction({ ...base, affordable: false }).kind,
    "resources",
  );
  assert.equal(deriveNextAction({ ...base, level: 25 }).kind, "max-level");
});

test("next action offers an upgrade only when it is immediately actionable", () => {
  assert.equal(deriveNextAction(base).kind, "upgrade");
});

test("entry guide remains read-only and routes each deterministic state to an existing focus target", () => {
  const input = {
    ...base,
    state: { buildings: { townhall: 1 } },
    selectedBuilding: "townhall",
    buildings: { townhall: {} },
  };
  assert.deepEqual(
    deriveEntryGuide({
      ...input,
      collection: { locked: false, unclaimed: { wood: 1 } },
    }),
    { kind: "collect", target: "collection" },
  );
  assert.deepEqual(
    deriveEntryGuide({
      ...input,
      jobs: [{ slot: 0, completesAt: 0 }],
      remainingTime: () => 0,
    }),
    { kind: "complete", slot: 0, target: "completion" },
  );
  assert.deepEqual(
    deriveEntryGuide({
      ...input,
      requirements: [{ id: "townhall", level: 2 }],
    }),
    { kind: "requirements", target: "building", buildingId: "townhall" },
  );
  assert.deepEqual(deriveEntryGuide({ ...input, state: null }), {
    kind: "unavailable",
    target: "none",
  });
});
