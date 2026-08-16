import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_CONTRACT,
  LIVE_WORLD_TOKEN,
  runtimeConfiguration,
} from "../src/lib/runtime-config.ts";

const productionEnvironment = () => ({
  AUTH_SECRET: "a".repeat(32),
  HMAC_SECRET_KEY: "b".repeat(32),
  AUTH_URL: "https://civilization.nyphon.de",
  AUTH_TRUST_HOST: "true",
  WORLD_APP_ID: "app_civilization",
  WORLD_ID_APP_ID: "app_civilization",
  WORLD_ID_ACTION: "play",
  WORLD_ID_PROOF_CONTEXT_URL: "https://civilization.nyphon.de/api/rp-signature",
  WORLD_ID_ENVIRONMENT: "production",
  RP_ID: "rp_a84548cb908798cf",
  RP_SIGNING_KEY: `0x${"ab".repeat(32)}`,
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
