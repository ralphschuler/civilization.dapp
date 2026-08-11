import test from "node:test";
import assert from "node:assert/strict";
import { COLLECTION_COOLDOWN_MS, MARCH_DURATION_MS, createInitialState, gather, getRequirements, resolveRaidMarch, sendRaid, settle, startGathering, startRaidMarch, swapInternal, trainTroop, upgradeBuilding } from "../src/game.js";
import { authenticateWorldWallet, buildTestnetRegistration, buildWorldIdRegistration, confirmWorldIdRegistration, getWorldIdConfig, installWorldAppBridge, requestWorldIdGameAccess, reserveWorldIdConnectorWindow, resolveWorldWalletAddress, submitWorldIdRegistration, walletAuthEndpoints, WORLD_CHAIN_ID, WORLD_CHAIN_SEPOLIA_ID } from "../src/world.js";

test("World bridge remains inactive in the regular browser demo", () => {
  assert.deepEqual(installWorldAppBridge(), { installed: false });
});

test("MiniKit transaction preserves its user-operation hash for React receipt polling", async () => {
  const result = await submitWorldIdRegistration(
    { chainId: WORLD_CHAIN_ID, to: walletAddress, data: "0x", value: "0x0" },
    { isInstalled: () => true, sendTransaction: async () => ({ data: { status: "success", userOpHash: "0xuserop" } }) },
  );
  assert.deepEqual(result, { ok: true, transaction: { status: "success", userOpHash: "0xuserop" }, userOpHash: "0xuserop" });
});

const worldConfigEnv = {
  VITE_WORLD_APP_ID: "app_example",
  VITE_WORLD_ID_ACTION: "play",
  VITE_CIVILIZATION_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111",
  VITE_WORLD_ID_PROOF_CONTEXT_URL: "https://api.example/proof",
  VITE_WORLD_ID_ENVIRONMENT: "production",
};
const walletAddress = "0x2222222222222222222222222222222222222222";

test("World wallet resolution reads current MiniKit state and the documented raw WorldApp fallback", () => {
  assert.equal(resolveWorldWalletAddress({ miniKit: { user: { walletAddress } } }), walletAddress);
  assert.equal(resolveWorldWalletAddress({ miniKit: { user: {} }, worldApp: { wallet_address: walletAddress } }), walletAddress);
  assert.equal(resolveWorldWalletAddress({ miniKit: { user: {} }, worldApp: { wallet_address: "not-an-address" } }), null);
});

test("World ID stays unavailable until its on-chain contract and trusted RP endpoint are configured", () => {
  assert.equal(getWorldIdConfig({ VITE_WORLD_APP_ID: "app_example" }).configured, false);
  assert.equal(getWorldIdConfig(worldConfigEnv).configured, true);
  assert.equal(getWorldIdConfig({ ...worldConfigEnv, VITE_CIVILIZATION_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000" }).configured, false);
});

test("World ID reports a retryable wallet error before requesting proof context", async () => {
  const result = await requestWorldIdGameAccess({ config: getWorldIdConfig(worldConfigEnv), walletAddress: null, fetchImpl: async () => {
    throw new Error("must_not_fetch");
  } });
  assert.deepEqual(result, { ok: false, reason: "world_wallet_unavailable" });
});

test("Wallet Auth supplies a World wallet when MiniKit has no cached address", async () => {
  let walletAuthInput;
  const calls = [];
  const verifiedWalletAddress = "0x3333333333333333333333333333333333333333";
  const result = await authenticateWorldWallet({
    miniKit: {
      isInstalled: () => true,
      walletAuth: async (input) => {
        walletAuthInput = input;
        return { executedWith: "minikit", data: { address: walletAddress, message: "SIWE", signature: "0xsigned" } };
      },
    },
    proofContextEndpoint: worldConfigEnv.VITE_WORLD_ID_PROOF_CONTEXT_URL,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (!options) return { ok: true, json: async () => ({ nonce: "a1b2c3d4e5f6a7b8", expires_at: Date.now() + 60_000 }) };
      assert.deepEqual(JSON.parse(options.body), { payload: { address: walletAddress, message: "SIWE", signature: "0xsigned" }, nonce: "a1b2c3d4e5f6a7b8" });
      return { ok: true, json: async () => ({ isValid: true, address: verifiedWalletAddress }) };
    },
  });
  assert.deepEqual(result, { ok: true, walletAddress: verifiedWalletAddress });
  assert.equal(walletAuthInput.nonce, "a1b2c3d4e5f6a7b8");
  assert.equal(walletAuthInput.statement, "Bestätige deine World-Wallet für den Civilization-Spielzugang.");
  assert.ok(walletAuthInput.expirationTime.getTime() > Date.now());
  assert.deepEqual(calls.map(({ url }) => url), ["https://api.example/api/wallet-auth/nonce", "https://api.example/api/wallet-auth/verify"]);
});

test("Wallet Auth endpoints stay on the trusted backend origin", () => {
  assert.deepEqual(walletAuthEndpoints("https://civilization.nyphon.de/api/world-id/proof-context"), {
    nonce: "https://civilization.nyphon.de/api/wallet-auth/nonce",
    verify: "https://civilization.nyphon.de/api/wallet-auth/verify",
  });
  assert.equal(walletAuthEndpoints("not a URL"), null);
});

test("Wallet Auth rejection yields no wallet for a proof request", async () => {
  let proofContexts = 0;
  let verificationRequests = 0;
  const auth = await authenticateWorldWallet({
    miniKit: { isInstalled: () => true, walletAuth: async () => { throw new Error("user_rejected"); } },
    proofContextEndpoint: worldConfigEnv.VITE_WORLD_ID_PROOF_CONTEXT_URL,
    fetchImpl: async (_url, options) => {
      if (options) verificationRequests += 1;
      return { ok: true, json: async () => ({ nonce: "a1b2c3d4e5f6a7b8", expires_at: Date.now() + 60_000 }) };
    },
  });
  assert.deepEqual(auth, { ok: false, reason: "user_rejected" });
  if (auth.ok) await requestWorldIdGameAccess({ config: getWorldIdConfig(worldConfigEnv), walletAddress: auth.walletAddress, fetchImpl: async () => { proofContexts += 1; } });
  assert.equal(proofContexts, 0, "a rejected Wallet Auth must not start a World ID proof request");
  assert.equal(verificationRequests, 0, "a rejected Wallet Auth must not reach SIWE verification");
});

test("Wallet Auth refuses a rejected backend verification before World ID proof", async () => {
  const auth = await authenticateWorldWallet({
    miniKit: { isInstalled: () => true, walletAuth: async () => ({ executedWith: "minikit", data: { address: walletAddress, message: "SIWE", signature: "0xsigned" } }) },
    proofContextEndpoint: worldConfigEnv.VITE_WORLD_ID_PROOF_CONTEXT_URL,
    fetchImpl: async (_url, options) => options
      ? { ok: false, json: async () => ({ isValid: false }) }
      : { ok: true, json: async () => ({ nonce: "a1b2c3d4e5f6a7b8", expires_at: Date.now() + 60_000 }) },
  });
  assert.deepEqual(auth, { ok: false, reason: "server_rejected_request" });
});

test("reserved IDKit connector is reused after Wallet Auth and closes on rejection", () => {
  const connectorWindow = { location: {}, closeCalls: 0, close() { this.closeCalls += 1; } };
  const openConnector = reserveWorldIdConnectorWindow((url, target) => {
    assert.equal(url, "");
    assert.equal(target, "_blank");
    return connectorWindow;
  });
  assert.deepEqual(openConnector("https://id.world.org/connect"), { ok: true, opened: true });
  assert.equal(connectorWindow.location.href, "https://id.world.org/connect");
  openConnector.close();
  assert.equal(connectorWindow.closeCalls, 1);
});

test("Sepolia test mode targets the deployed mock contract but never enables real World ID", () => {
  const config = getWorldIdConfig({
    VITE_CIVILIZATION_NETWORK: "worldchain-sepolia",
    VITE_CIVILIZATION_CONTRACT_ADDRESS: "0xfCdB50926c3c6b2CDF3ACE76B13c9383A2DC3199",
    VITE_CIVILIZATION_TESTNET_WORLD_TOKEN: "0x29147C7BEAd901E8019d7911A7DC404447877C62",
    VITE_CIVILIZATION_TESTNET_WORLD_ID_VERIFIER: "0x1A64F89881FD2E38255E62c6D62b68076052DF4b",
  });
  assert.equal(config.chainId, WORLD_CHAIN_SEPOLIA_ID);
  assert.equal(config.configured, false);
  assert.equal(config.testnetConfigured, true);
  const registration = buildTestnetRegistration({ config, walletAddress });
  assert.equal(registration.chainId, WORLD_CHAIN_SEPOLIA_ID);
  assert.equal(registration.to, config.contractAddress);
  assert.match(registration.data, /^0x/);
});

test("World ID 4 proof becomes World Chain registration calldata without backend approval", async () => {
  const config = getWorldIdConfig(worldConfigEnv);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ rp_id: "rp_example", nonce: "0x1234", created_at: 1, expires_at: 2, signature: "0xsignature" }) };
  };
  let requestOptions;
  const openedConnectors = [];
  const idkit = { request: (request) => ({ preset: async (preset) => {
    requestOptions = { request, preset };
    return { connectorURI: "https://id.world.org/connect", pollUntilCompletion: async () => ({ success: true, result: {
      protocol_version: "4.0", nonce: "0x1234", action: request.action,
      responses: [{ identifier: "proof_of_human", signal_hash: "0x123", nullifier: "0x456", expires_at_min: 3, issuer_schema_id: 1, proof: ["0x1", "0x2", "0x3", "0x4", "0x5"] }],
    } }) };
  } }) };
  const humanPreset = (input) => ({ type: "ProofOfHuman", ...input });
  const result = await requestWorldIdGameAccess({ config, walletAddress, fetchImpl, idkit, humanPreset, openConnector: (uri) => {
    openedConnectors.push(uri);
    return { ok: true };
  } });
  assert.equal(result.ok, true);
  assert.equal(result.registration.chainId, 480);
  assert.equal(result.registration.to, worldConfigEnv.VITE_CIVILIZATION_CONTRACT_ADDRESS);
  assert.match(result.registration.data, /^0x/);
  assert.equal(calls.length, 1, "the backend signs RP context only; it never verifies or approves registration");
  assert.equal(calls[0].body.action, "play");
  assert.equal(calls[0].body.signal, walletAddress);
  assert.equal(requestOptions.request.allow_legacy_proofs, false);
  assert.deepEqual(requestOptions.preset, { type: "ProofOfHuman", signal: walletAddress });
  assert.deepEqual(openedConnectors, ["https://id.world.org/connect"]);
});

test("World ID surfaces connector-opening failures instead of polling blindly", async () => {
  const config = getWorldIdConfig(worldConfigEnv);
  let polled = false;
  const result = await requestWorldIdGameAccess({
    config,
    walletAddress,
    fetchImpl: async () => ({ ok: true, json: async () => ({ rp_id: "rp_example", nonce: "0x1234", created_at: 1, expires_at: 2, signature: "0xsignature" }) }),
    humanPreset: (input) => input,
    idkit: { request: () => ({ preset: async () => ({ connectorURI: "https://id.world.org/connect", pollUntilCompletion: async () => { polled = true; return { success: true }; } }) }) },
    openConnector: () => ({ ok: false, reason: "connector_open_blocked" }),
  });
  assert.deepEqual(result, { ok: false, reason: "connector_open_blocked" });
  assert.equal(polled, false);
});

test("World ID client does not create registration calldata from a non-v4 or incomplete proof", () => {
  const config = getWorldIdConfig(worldConfigEnv);
  assert.throws(() => buildWorldIdRegistration({ config, walletAddress, result: { protocol_version: "3.0" } }), /world_id_v4_proof_required/);
  assert.throws(() => buildWorldIdRegistration({ config, walletAddress, result: { protocol_version: "4.0", responses: [] } }), /incomplete_world_id_proof/);
});

test("World ID gate waits for World Chain playerState registration after MiniKit submission", async () => {
  const calls = [];
  const waits = [];
  const confirmation = await confirmWorldIdRegistration({
    config: getWorldIdConfig(worldConfigEnv),
    walletAddress,
    attempts: 2,
    retryDelayMs: 25,
    readPlayerState: async (request) => {
      calls.push(request);
      return calls.length === 2;
    },
    sleep: async (milliseconds) => { waits.push(milliseconds); },
  });
  assert.deepEqual(confirmation, { ok: true, attempts: 2 });
  assert.deepEqual(calls, [
    { contractAddress: worldConfigEnv.VITE_CIVILIZATION_CONTRACT_ADDRESS, walletAddress },
    { contractAddress: worldConfigEnv.VITE_CIVILIZATION_CONTRACT_ADDRESS, walletAddress },
  ]);
  assert.deepEqual(waits, [25]);
});

test("World ID gate remains retryable when World Chain never confirms registration", async () => {
  const confirmation = await confirmWorldIdRegistration({
    config: getWorldIdConfig(worldConfigEnv), walletAddress, attempts: 2, retryDelayMs: 0,
    readPlayerState: async () => ({ registered: false }), sleep: async () => {},
  });
  assert.deepEqual(confirmation, { ok: false, reason: "registration_not_confirmed", attempts: 2 });
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
