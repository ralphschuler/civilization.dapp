import test from "node:test";
import assert from "node:assert/strict";
import { createWalletReview } from "../src/world-game/review.js";
import { createWorldRuntime } from "../src/game-world-runtime.js";

test("wallet review freezes an action-specific intent before confirmation", () => {
  const review = createWalletReview();
  const payload = { building: "quarry", nested: { level: 2 } };
  review.begin("upgrade", payload, ["Upgrade quarry"]);
  payload.building = "barracks";
  payload.nested.level = 99;

  const opened = review.state();
  assert.equal(opened.status, "reviewing");
  assert.deepEqual(opened.intent.payload, {
    building: "quarry",
    nested: { level: 2 },
  });
  assert.ok(Object.isFrozen(opened.intent));
  assert.ok(Object.isFrozen(opened.intent.payload.nested));
  assert.throws(() => {
    opened.intent.payload.building = "timber";
  }, TypeError);

  review.confirm();
  assert.equal(review.state().status, "confirming");
  review.pending();
  assert.equal(review.state().status, "pending");
  review.confirmed();
  assert.equal(review.state().status, "confirmed");
});

test("market changes invalidate review and cancellation/revert expose terminal status", () => {
  const review = createWalletReview();
  review.begin("market_buy", { resource: "wood", amount: 3, limit: 7n }, [
    "Buy 3 Wood",
  ]);
  review.invalidate("market_inputs_changed");
  assert.equal(review.state().status, "invalidated");
  assert.equal(review.state().reason, "market_inputs_changed");
  assert.throws(() => review.confirm(), /review_not_available/);
  review.cancel();
  assert.equal(review.state().status, "cancelled");

  review.begin("start_raid", { targetId: "0xabc", army: { spear: 1 } }, [
    "Target",
  ]);
  review.confirm();
  review.reverted("contract_insufficient_resources");
  assert.deepEqual(review.state(), {
    status: "reverted",
    intent: review.state().intent,
    reason: "contract_insufficient_resources",
  });
});

test("World runtime opens review before dispatch and executes the frozen snapshot only after confirm", async () => {
  let sent = null;
  const runtime = {
    ready: true,
    busy: false,
    token: Symbol("runtime"),
    state: { version: 1 },
    worldStateEpoch: 0,
    adapter: {
      execute: async (type, payload) => {
        sent = { type, payload };
        return { state: { version: 2 }, pending: false };
      },
    },
  };
  const world = createWorldRuntime({
    runtime,
    isCurrent: () => true,
    render: () => {},
    errorText: (error) => error.message,
    hasAccess: () => true,
    copy: () => ({
      feedback: {
        reviewRequired: "review",
        reviewCancelled: "cancelled",
        worldTransactionConfirmation: "confirming",
        worldTransactionPending: "pending",
      },
    }),
  });
  const payload = { troop: "spear", amount: 1 };
  world.requestAction("train", payload, "done", ["Train 1 Spearman"]);
  payload.amount = 99;
  assert.equal(sent, null, "opening review never opens the wallet flow");
  await world.confirmReview("done");
  assert.deepEqual(sent, {
    type: "train",
    payload: { troop: "spear", amount: 1 },
  });
  assert.equal(runtime.review.state().status, "confirmed");
});

test("a rejected training receipt never replaces state with phantom troops", async () => {
  const runtime = {
    ready: true,
    busy: false,
    token: Symbol("runtime"),
    state: { troops: { spear: 2 } },
    worldStateEpoch: 0,
    adapter: {
      execute: async () => {
        throw new Error("transaction_failed");
      },
    },
  };
  const world = createWorldRuntime({
    runtime,
    isCurrent: () => true,
    render: () => {},
    errorText: (error) => error.message,
    hasAccess: () => true,
    copy: () => ({
      feedback: {
        reviewRequired: "review",
        reviewCancelled: "cancelled",
        worldTransactionConfirmation: "confirming",
        worldTransactionPending: "pending",
      },
    }),
  });
  world.requestAction("train", { troop: "spear", amount: 3 }, "done", []);
  await world.confirmReview("done");
  assert.deepEqual(runtime.state, { troops: { spear: 2 } });
  assert.equal(runtime.review.state().status, "reverted");
});
