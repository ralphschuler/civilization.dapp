import assert from "node:assert/strict";
import test from "node:test";
import { projectCurrentVillageSummary } from "../src/game-ui/current-village-summary.js";

const snapshot = (overrides = {}) => ({
  registered: true,
  chainTimestamp: 1_000,
  constructions: [],
  ...overrides,
});

test("current village summary projects ready-only from chain time", () => {
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
    {
      ready: { buildingId: "timber", slot: 2 },
      collectible: false,
      showBuild: false,
    },
  );
});

test("current village summary projects collect-only and a next-build route", () => {
  assert.deepEqual(
    projectCurrentVillageSummary({
      state: snapshot(),
      collection: { locked: false },
      unclaimed: { wood: 1 },
    }),
    { ready: null, collectible: true, showBuild: false },
  );
  assert.deepEqual(
    projectCurrentVillageSummary({
      state: snapshot(),
      collection: { locked: true },
      unclaimed: { wood: 1 },
    }),
    { ready: null, collectible: false, showBuild: true },
  );
});

test("current village summary keeps ready construction and collection independently visible", () => {
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
    collectible: true,
    showBuild: false,
  });
});

test("a replacement snapshot replaces stale ready state and never uses browser time", () => {
  const stale = projectCurrentVillageSummary({
    state: snapshot({
      constructions: [
        { pending: true, buildingId: "timber", completesAt: 1_000, slot: 0 },
      ],
    }),
    collection: { locked: true },
    unclaimed: {},
  });
  const replacement = projectCurrentVillageSummary({
    state: snapshot({
      chainTimestamp: 999,
      constructions: [
        { pending: true, buildingId: "timber", completesAt: 1_000, slot: 0 },
      ],
    }),
    collection: { locked: true },
    unclaimed: {},
  });
  assert.equal(stale?.ready?.slot, 0);
  assert.equal(replacement?.ready, null);
  assert.equal(replacement?.showBuild, true);
  assert.equal(
    projectCurrentVillageSummary({
      state: snapshot({ registered: false }),
      collection: {},
      unclaimed: {},
    }),
    null,
  );
});
