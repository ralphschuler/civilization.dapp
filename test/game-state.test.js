import test from "node:test";
import assert from "node:assert/strict";
import { applyGameAction, idempotentMutation, validateAction, validateActionId, validateAnonymousId } from "../server/game-state.js";
import { createInitialState } from "../src/game.js";

test("anonymous browser and action identifiers have bounded opaque formats", () => {
  assert.equal(validateAnonymousId("a".repeat(32)), true);
  assert.equal(validateAnonymousId("short"), false);
  assert.equal(validateAnonymousId("a".repeat(129)), false);
  assert.equal(validateActionId("action_id-000000"), true);
  assert.equal(validateActionId("too-short"), false);
});

test("server action validation rejects client supplied state and unsafe values", () => {
  assert.deepEqual(validateAction({ type: "upgrade", payload: { building: "timber" } }), { type: "upgrade", payload: { building: "timber" } });
  assert.equal(validateAction({ type: "upgrade", payload: { building: "timber", resources: { wood: 999999 } } }), null);
  assert.equal(validateAction({ type: "swap", payload: { from: "gold", to: "wood", amount: 1 } }), null);
  assert.equal(validateAction({ type: "train", payload: { troop: "spear", amount: 1.5 } }), null);
  assert.equal(validateAction({ type: "unknown", payload: {} }), null);
});

test("the same action id is applied exactly once", () => {
  const state = createInitialState(0);
  const cache = new Map();
  const action = validateAction({ type: "upgrade", payload: { building: "timber" } });
  const first = idempotentMutation(cache, "a".repeat(16), () => ({ result: applyGameAction(state, action, 0), wood: state.resources.wood }));
  const second = idempotentMutation(cache, "a".repeat(16), () => ({ result: applyGameAction(state, action, 0), wood: state.resources.wood }));
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.deepEqual(second.result, first.result);
  assert.equal(second.wood, first.wood);
  assert.equal(state.buildings.timber, 2);
});
