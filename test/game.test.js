import test from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_COOLDOWN_MS, MARCH_DURATION_MS, createInitialState, gather, getRequirements, resolveRaidMarch, sendRaid, settle, startGathering, startRaidMarch, swapInternal, trainTroop, upgradeBuilding } from "../src/game.js";
import { getWorldIdConfig, installWorldAppBridge, requestWorldIdGameAccess, WORLD_ID_GAME_ACCESS_ACTION } from "../src/world.js";

test("World bridge remains inactive in the regular browser demo", () => {
  assert.deepEqual(installWorldAppBridge(), { installed: false });
});

test("World ID stays unavailable until both trusted HTTPS endpoints are configured", () => {
  assert.equal(getWorldIdConfig({ VITE_WORLD_APP_ID: "app_example" }).configured, false);
  assert.equal(getWorldIdConfig({
    VITE_WORLD_APP_ID: "app_example", VITE_WORLD_ID_PROOF_CONTEXT_URL: "https://api.example/proof",
    VITE_WORLD_ID_VERIFY_URL: "https://api.example/verify", VITE_WORLD_ID_ENVIRONMENT: "production",
  }).configured, true);
});

test("World ID access is granted only after the server verifies the returned proof", async () => {
  const config = getWorldIdConfig({
    VITE_WORLD_APP_ID: "app_example", VITE_WORLD_ID_PROOF_CONTEXT_URL: "https://api.example/proof",
    VITE_WORLD_ID_VERIFY_URL: "https://api.example/verify", VITE_WORLD_ID_ENVIRONMENT: "production",
  });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const body = url === config.proofContextEndpoint
      ? { rp_id: "rp_example", nonce: "nonce", created_at: 1, expires_at: 2, signature: "0xsignature" }
      : { verified: true };
    return { ok: true, json: async () => body };
  };
  const idkit = { request: (request) => ({ preset: async () => ({ pollUntilCompletion: async () => ({ success: true, result: { protocol_version: "4.0", action: request.action } }) }) }) };
  assert.deepEqual(await requestWorldIdGameAccess({ config, fetchImpl, idkit }), { ok: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.action, WORLD_ID_GAME_ACCESS_ACTION);
  assert.equal(calls[1].body.idkitResponse.action, WORLD_ID_GAME_ACCESS_ACTION);
});

test("World ID client proof alone cannot grant access", async () => {
  const config = getWorldIdConfig({
    VITE_WORLD_APP_ID: "app_example", VITE_WORLD_ID_PROOF_CONTEXT_URL: "https://api.example/proof",
    VITE_WORLD_ID_VERIFY_URL: "https://api.example/verify", VITE_WORLD_ID_ENVIRONMENT: "production",
  });
  let requestCount = 0;
  const fetchImpl = async () => ({ ok: true, json: async () => (++requestCount === 1
    ? { rp_id: "rp_example", nonce: "nonce", created_at: 1, expires_at: 2, signature: "0xsignature" }
    : { verified: false }) });
  const idkit = { request: () => ({ preset: async () => ({ pollUntilCompletion: async () => ({ success: true, result: {} }) }) }) };
  assert.deepEqual(await requestWorldIdGameAccess({ config, fetchImpl, idkit }), { ok: false, reason: "verification_rejected" });
});

test("resource buildings fill raidable field stock before collection", () => {
  const state = createInitialState(0);
  const beforeWood = state.resources.wood;
  settle(state, 10_000);
  assert.equal(state.resources.wood, beforeWood);
  assert.ok(state.unclaimed.wood > 0);
});

test("collection moves field stock into the protected storage", () => {
  const state = createInitialState(0);
  settle(state, 10_000);
  const beforeWood = state.resources.wood;
  const beforeFieldWood = state.unclaimed.wood;
  const result = gather(state, 10_000);
  assert.ok(result.collected.wood > 0);
  assert.equal(state.resources.wood, beforeWood + beforeFieldWood);
  assert.equal(state.unclaimed.wood, 0);
});

test("collection locks for one minute after gathering", () => {
  const state = createInitialState(0);
  settle(state, 10_000);
  assert.equal(startGathering(state, 10_000).ok, true);
  assert.equal(state.gatherAvailableAt, 10_000 + COLLECTION_COOLDOWN_MS);
  assert.equal(startGathering(state, 10_001).reason, "cooldown");
  assert.equal(startGathering(state, 10_000 + COLLECTION_COOLDOWN_MS).ok, true);
});

test("field stock cannot pay building costs before collection", () => {
  const state = createInitialState(0);
  state.resources = { wood: 0, clay: 0, stone: 0, gold: 0 };
  settle(state, 3_600_000);
  assert.ok(state.unclaimed.wood > 0);
  assert.equal(upgradeBuilding(state, "timber", 3_600_000).reason, "resources");
  gather(state, 3_600_000);
  assert.equal(upgradeBuilding(state, "timber", 3_600_000).ok, true);
});

test("Rathaus level 2 requires each primary resource building at level 2", () => {
  const state = createInitialState(0);
  const missing = getRequirements(state, "townhall");
  assert.equal(missing.length, 3);
  assert.equal(upgradeBuilding(state, "townhall", 0).reason, "requirements");
});

test("training is locked until the barracks requirement is met", () => {
  const state = createInitialState(0);
  assert.equal(trainTroop(state, "spear", 1, 0).reason, "requirements");
});

test("a winning raid transfers resources and removes some troops", () => {
  const state = createInitialState(0);
  state.troops.spear = 6;
  const beforeWood = state.resources.wood;
  const target = state.targets.find((item) => item.id === "river");
  const beforeTargetWood = target.unclaimed.wood;
  const result = sendRaid(state, "river", { spear: 6, archer: 0, rider: 0 }, 0);
  assert.equal(result.ok, true);
  assert.equal(result.ok, result.attack >= result.defense);
  assert.ok(state.resources.wood > beforeWood);
  assert.ok(target.unclaimed.wood < beforeTargetWood);
  assert.ok(state.troops.spear < 6);
});

test("a raid resolves only after its one-minute march and blocks another march", () => {
  const state = createInitialState(0);
  state.troops.spear = 6;
  const beforeWood = state.resources.wood;
  const first = startRaidMarch(state, "river", { spear: 6, archer: 0, rider: 0 }, 10_000);
  assert.equal(first.ok, true);
  assert.equal(first.arrivesAt, 10_000 + MARCH_DURATION_MS);
  assert.equal(state.resources.wood, beforeWood);
  assert.equal(state.troops.spear, 6);
  assert.equal(startRaidMarch(state, "river", { spear: 1, archer: 0, rider: 0 }, 10_001).reason, "march");
  assert.equal(resolveRaidMarch(state, first.arrivesAt - 1).reason, "march");
  assert.equal(state.resources.wood, beforeWood);
  const result = resolveRaidMarch(state, first.arrivesAt);
  assert.equal(result.ok, true);
  assert.equal(state.pendingRaid, null);
  assert.equal(state.raids, 1);
});

test("only non-gold resources can use the local market", () => {
  const state = createInitialState(0);
  const clayBefore = state.resources.clay;
  assert.equal(swapInternal(state, "wood", "clay", 20, 0).ok, true);
  assert.ok(state.resources.clay > clayBefore);
  assert.equal(swapInternal(state, "gold", "wood", 5, 0).reason, "market");
});
