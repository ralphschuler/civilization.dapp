import test from "node:test";
import assert from "node:assert/strict";
import {
  marketPrefill,
  marketPrefills,
} from "../src/world-game/market-intent.js";
import { createGameActions } from "../src/game-actions.js";
import { civilizationMessages } from "../src/lib/civilization-locale.ts";

test("market prefills preserve exact tradable deficits without rounding", () => {
  assert.deepEqual(marketPrefills({ wood: 52, clay: 30, stone: 0, gold: 7 }), [
    { resource: "wood", amount: 52 },
    { resource: "clay", amount: 30 },
  ]);
  assert.deepEqual(marketPrefill({ gold: 7, wood: 52 }), {
    resource: "wood",
    amount: 52,
  });
});

test("market prefill rejects fractions, zero, and unsafe amounts", () => {
  assert.equal(marketPrefill({ wood: 1.5 }), null);
  assert.equal(marketPrefill({ clay: 0 }), null);
  assert.equal(marketPrefill({ stone: Number.MAX_SAFE_INTEGER + 1 }), null);
});

test("opening a deficit market freezes the exact draft and preserves its source", () => {
  const invalidations = [];
  const runtime = {
    mode: "world",
    marketDraft: { resource: "wood", from: "wood", to: "clay", amount: 1 },
    marketQuote: { resource: "wood", amount: 1 },
    marketInputRevision: 0,
    activePanel: "build",
    review: {
      invalidate: (reason) => invalidations.push(reason),
      state: () => ({ status: "idle" }),
    },
  };
  const actions = createGameActions(runtime, {
    render: () => {},
    requireAccess: () => true,
    requestWorldAction: () => {},
    confirmWorldReview: () => {},
    cancelWorldReview: () => {},
    errorText: String,
    isCurrent: () => true,
    copy: () => civilizationMessages("en-US"),
    buildingLabel: String,
    resourceDefs: () => ({}),
    numberFormat: String,
  });

  actions.openMarket({
    resource: "clay",
    amount: 30,
    source: "Clay pit 8",
    panel: "build",
  });

  assert.deepEqual(runtime.marketDraft, {
    resource: "clay",
    from: "wood",
    to: "clay",
    amount: 30,
  });
  assert.equal(runtime.marketQuote, null);
  assert.equal(runtime.activePanel, "market");
  assert.deepEqual(runtime.marketOrigin, {
    source: "Clay pit 8",
    panel: "build",
    resource: "clay",
    amount: 30,
  });
  assert.deepEqual(invalidations, ["market_inputs_changed"]);
});
