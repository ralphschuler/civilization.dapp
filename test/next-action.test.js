import assert from "node:assert/strict";
import test from "node:test";
import { deriveNextAction } from "../src/game-ui/next-action.js";

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
