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

test("next action completes a ready construction without first collecting field resources", () => {
  assert.deepEqual(
    deriveNextAction({
      ...base,
      collection: { locked: false, unclaimed: { wood: 20 } },
      jobs: [{ slot: 0, completesAt: 0 }],
      remainingTime: () => 0,
    }),
    { kind: "complete", slot: 0 },
  );
});

test("next action completes a ready construction after a voluntary collection", () => {
  assert.deepEqual(
    deriveNextAction({
      ...base,
      collection: { locked: true, unclaimed: {} },
      jobs: [{ slot: 0, completesAt: 0 }],
      remainingTime: () => 0,
    }),
    { kind: "complete", slot: 0 },
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

test("next action retains concrete upgrade dependencies when no construction is ready", () => {
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

test("visible map entry-guide targets do not require a redundant route control", async () => {
  const entryGuide = await (
    await import("node:fs/promises")
  ).readFile(
    new URL("../src/components/EntryGuide.tsx", import.meta.url),
    "utf8",
  );
  assert.match(entryGuide, /recommendation\.target === "completion"/);
  assert.match(entryGuide, /recommendation\.target === "build-panel"/);
  assert.doesNotMatch(entryGuide, /entryGuideShow/);
  assert.doesNotMatch(entryGuide, /recommendation\.target !== "none"/);
});
