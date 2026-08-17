import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_CONTRACT,
  LIVE_WORLD_TOKEN,
  runtimeConfiguration,
} from "../src/lib/runtime-config.ts";

const productionEnvironment = () => ({
  WALLET_AUTH_URL: "https://civilization.nyphon.de",
  WORLD_APP_ID: "app_civilization",
  CIVILIZATION_CONTRACT_ADDRESS: LIVE_CONTRACT,
  CIVILIZATION_CHAIN_ID: "480",
  CIVILIZATION_WORLD_TOKEN_ADDRESS: LIVE_WORLD_TOKEN,
});

test("production WLD runtime configuration accepts the canonical World Chain pair", () => {
  const configuration = runtimeConfiguration(productionEnvironment());

  assert.equal(configuration.ready, true);
  assert.deepEqual(configuration.missing, []);
  assert.equal(configuration.world.worldChainId, 480);
  assert.equal(configuration.world.worldTokenAddress, LIVE_WORLD_TOKEN);
});

test("production WLD runtime configuration fails closed when its token is missing", () => {
  const environment = productionEnvironment();
  delete environment.CIVILIZATION_WORLD_TOKEN_ADDRESS;

  const configuration = runtimeConfiguration(environment);

  assert.equal(configuration.ready, false);
  assert.deepEqual(configuration.missing, ["CIVILIZATION_WORLD_TOKEN_ADDRESS"]);
});

test("production WLD runtime configuration rejects a wrong token or chain", () => {
  const tokenMismatch = runtimeConfiguration({
    ...productionEnvironment(),
    CIVILIZATION_WORLD_TOKEN_ADDRESS:
      "0x0000000000000000000000000000000000000001",
  });
  const chainMismatch = runtimeConfiguration({
    ...productionEnvironment(),
    CIVILIZATION_CHAIN_ID: "1",
  });

  assert.equal(tokenMismatch.ready, false);
  assert.deepEqual(tokenMismatch.missing, ["CIVILIZATION_WORLD_TOKEN_ADDRESS"]);
  assert.equal(chainMismatch.ready, false);
  assert.deepEqual(chainMismatch.missing, ["CIVILIZATION_CHAIN_ID"]);
});
