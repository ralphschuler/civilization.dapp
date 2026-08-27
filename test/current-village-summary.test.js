import assert from "node:assert/strict";
import test from "node:test";
import { projectCurrentVillageSummary } from "../src/game-ui/current-village-summary.js";

const snapshot = (overrides = {}) => ({
  registered: true,
  chainTimestamp: 1_000,
  constructions: [],
  ...overrides,
});

test("current village summary stays absent when only construction is ready", () => {
  assert.deepEqual(
    projectCurrentVillageSummary({
      state: snapshot({
        constructions: [
          { pending: true, buildingId: "timber", completesAt: 1_000, slot: 2 },
        ],
      }),
      collection: { locked: true },
      unclaimed: { wood: 20 },
    }),
    null,
  );
});

test("current village summary stays absent without concurrent actions", () => {
  assert.deepEqual(
    projectCurrentVillageSummary({
      state: snapshot(),
      collection: { locked: false },
      unclaimed: { wood: 1 },
    }),
    null,
  );
  assert.deepEqual(
    projectCurrentVillageSummary({
      state: snapshot(),
      collection: { locked: true },
      unclaimed: { wood: 1 },
    }),
    null,
  );
});

test("current village summary projects ready construction and collection together", () => {
  const summary = projectCurrentVillageSummary({
    state: snapshot({
      constructions: [
        { pending: true, buildingId: "quarry", completesAt: 999, slot: 1 },
      ],
    }),
    collection: { locked: false },
    unclaimed: { stone: 5 },
  });
  assert.deepEqual(summary, {
    ready: { buildingId: "quarry", slot: 1 },
  });
});

test("a replacement snapshot replaces stale ready state and never uses browser time", () => {
  const stale = projectCurrentVillageSummary({
    state: snapshot({
      constructions: [
        { pending: true, buildingId: "timber", completesAt: 1_000, slot: 0 },
      ],
    }),
    collection: { locked: false },
    unclaimed: { wood: 1 },
  });
  const replacement = projectCurrentVillageSummary({
    state: snapshot({
      chainTimestamp: 999,
      constructions: [
        { pending: true, buildingId: "timber", completesAt: 1_000, slot: 0 },
      ],
    }),
    collection: { locked: false },
    unclaimed: { wood: 1 },
  });
  assert.equal(stale?.ready.slot, 0);
  assert.equal(replacement, null);
  assert.equal(
    projectCurrentVillageSummary({
      state: snapshot({ registered: false }),
      collection: {},
      unclaimed: {},
    }),
    null,
  );
});
