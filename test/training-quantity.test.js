import assert from "node:assert/strict";
import test from "node:test";
import { createGameActions } from "../src/game-actions.js";
import { TROOPS } from "../src/game.js";
import {
  maxTrainableAmount,
  trainingCost,
  validateTrainingAmount,
} from "../src/world-game/training-quantity.js";

test("training quantity derives its only maximum from live resources and unit costs", () => {
  const cost = { wood: 20, clay: 7, gold: 0 };
  assert.equal(maxTrainableAmount({ wood: 99, clay: 36, gold: 5 }, cost), 4);
  assert.deepEqual(trainingCost(cost, 4), { wood: 80, clay: 28, gold: 0 });
  assert.equal(maxTrainableAmount({ wood: 1, clay: 1 }, cost), 0);
});

test("training quantities reject zero, fractions, unsafe values, and unaffordable amounts", () => {
  for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.deepEqual(validateTrainingAmount(amount, 3), {
      ok: false,
      reason: "invalid",
    });
  assert.deepEqual(validateTrainingAmount(4, 3), {
    ok: false,
    reason: "unaffordable",
  });
  assert.deepEqual(validateTrainingAmount(3, 3), { ok: true, amount: 3 });
});

test("world training forwards the selected amount and multiplied costs into one review intent", () => {
  const requested = [];
  const resources = Object.fromEntries(
    Object.keys(TROOPS.spear.cost).map((resource) => [resource, 1_000]),
  );
  const runtime = { mode: "world", state: { resources }, feedback: "" };
  const actions = createGameActions(runtime, {
    render: () => undefined,
    requireAccess: () => true,
    requestWorldAction: (...args) => requested.push(args),
    confirmWorldReview: () => undefined,
    cancelWorldReview: () => undefined,
    errorText: (error) => error.message,
    isCurrent: () => true,
    copy: () => ({
      troopNames: { spear: "Spearman" },
      trainingTotalCost: "Total cost",
      feedback: {
        worldTrainingComplete: () => "done",
        trainingUnavailable: "no",
      },
    }),
    buildingLabel: (id) => id,
    resourceDefs: () => ({
      wood: { short: "W" },
      clay: { short: "C" },
      stone: { short: "S" },
      gold: { short: "G" },
    }),
    numberFormat: String,
  });

  actions.train("spear", 3);
  assert.deepEqual(requested[0].slice(0, 2), [
    "train",
    { troop: "spear", amount: 3 },
  ]);
  assert.match(requested[0][3][0], /Train 3 Spearman/);
  assert.match(requested[0][3][1], /Total cost:/);

  actions.train("spear", 0);
  assert.equal(
    requested.length,
    1,
    "invalid values never open a wallet review",
  );
});
