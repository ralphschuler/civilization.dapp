import test from "node:test";
import assert from "node:assert/strict";
import { applyGameAction, validateAction } from "../server/game-state.js";
import { MARCH_DURATION_MS, createInitialState } from "../src/game.js";
import { resolvePvpRaid, startPvpRaid } from "../server/pvp.js";

const attackerVillageId = "v_AttackerOpaqueVillage001";
const defenderVillageId = "v_DefenderOpaqueVillage001";

function action(type, payload = {}) {
  const value = validateAction({ type, payload });
  assert.ok(value, `action ${type} must pass the server allowlist`);
  return value;
}

function dispatch(state, type, payload, now) {
  return applyGameAction(state, action(type, payload), now);
}

test("authoritative action flow progresses, collects, trains, and records raid failures", () => {
  const attacker = createInitialState(0);

  // The client submits only allowlisted intent; each transition uses the
  // authoritative action dispatcher and its server-owned state.
  assert.equal(dispatch(attacker, "upgrade", { building: "timber" }, 0).ok, true);
  assert.equal(dispatch(attacker, "upgrade", { building: "claypit" }, 0).ok, true);
  assert.equal(dispatch(attacker, "upgrade", { building: "quarry" }, 0).ok, true);
  const collection = dispatch(attacker, "gather", {}, 8 * 60 * 60 * 1000);
  assert.equal(collection.ok, true);
  assert.ok(collection.collected.wood > 0);
  assert.equal(attacker.resources.wood, 500, "collection fills protected storage before spending");
  assert.ok(attacker.unclaimed.wood > 0, "overflow remains in the raidable field stock");

  assert.equal(dispatch(attacker, "upgrade", { building: "townhall" }, 8 * 60 * 60 * 1000).ok, true);
  assert.equal(dispatch(attacker, "upgrade", { building: "workshop" }, 8 * 60 * 60 * 1000).ok, true);
  assert.equal(dispatch(attacker, "upgrade", { building: "timber" }, 8 * 60 * 60 * 1000).ok, true);
  assert.equal(dispatch(attacker, "upgrade", { building: "claypit" }, 8 * 60 * 60 * 1000).ok, true);
  assert.equal(dispatch(attacker, "upgrade", { building: "quarry" }, 8 * 60 * 60 * 1000).ok, true);
  assert.equal(dispatch(attacker, "upgrade", { building: "warehouse" }, 8 * 60 * 60 * 1000).ok, true);
  assert.equal(dispatch(attacker, "gather", {}, 16 * 60 * 60 * 1000).ok, true);
  assert.equal(dispatch(attacker, "upgrade", { building: "townhall" }, 16 * 60 * 60 * 1000).ok, true);
  assert.equal(dispatch(attacker, "upgrade", { building: "barracks" }, 16 * 60 * 60 * 1000).ok, true);
  assert.equal(dispatch(attacker, "train", { troop: "spear", amount: 1 }, 16 * 60 * 60 * 1000).ok, true);

  const defender = createInitialState(0);
  const noExtraTroops = startPvpRaid(attacker, attackerVillageId, defenderVillageId, { spear: 2, archer: 0, rider: 0 }, 16 * 60 * 60 * 1000, Buffer.alloc(32, 4));
  assert.deepEqual(noExtraTroops, { ok: false, reason: "availability" });

  const raidStart = startPvpRaid(attacker, attackerVillageId, defenderVillageId, { spear: 1, archer: 0, rider: 0 }, 16 * 60 * 60 * 1000, Buffer.alloc(32, 4));
  assert.equal(raidStart.ok, true);
  assert.deepEqual(startPvpRaid(attacker, attackerVillageId, defenderVillageId, { spear: 1, archer: 0, rider: 0 }, 16 * 60 * 60 * 1000 + 1, Buffer.alloc(32, 5)), { ok: false, reason: "march" });
  assert.deepEqual(resolvePvpRaid(attacker, defender, attackerVillageId, defenderVillageId, 16 * 60 * 60 * 1000 + MARCH_DURATION_MS - 1, Buffer.alloc(32, 4)), { ok: false, reason: "march" });
  const result = resolvePvpRaid(attacker, defender, attackerVillageId, defenderVillageId, 16 * 60 * 60 * 1000 + MARCH_DURATION_MS, Buffer.alloc(32, 4));
  assert.equal(result.ok, false, "one spear cannot beat the initial online village defense");
  assert.equal(attacker.raids, 1);
  assert.equal(attacker.pendingRaid, null);
});
