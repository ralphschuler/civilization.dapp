import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_CONTRACT,
  LIVE_WORLD_TOKEN,
  runtimeConfiguration,
} from "../src/lib/runtime-config.ts";

const productionEnvironment = () => ({
  CIVILIZATION_ENV: "production",
  WALLET_AUTH_URL: "https://civilization.example.invalid",
  WORLD_APP_ID: "app_civilization",
  CIVILIZATION_CONTRACT_ADDRESS: LIVE_CONTRACT,
  CIVILIZATION_CHAIN_ID: "480",
  CIVILIZATION_WORLD_TOKEN_ADDRESS: LIVE_WORLD_TOKEN,
  WALLET_AUTH_RATE_LIMIT_SECRET: "a".repeat(32),
  WALLET_AUTH_TRUSTED_PROXY_HOPS: "1",
});

const developmentEnvironment = () => ({
  CIVILIZATION_ENV: "development",
  DEV_WALLET_AUTH_URL: "https://civilization-dev.example.invalid",
  DEV_WORLD_APP_ID: "app_civilizationdev",
  DEV_CIVILIZATION_CONTRACT_ADDRESS:
    "0x0000000000000000000000000000000000000001",
  DEV_CIVILIZATION_CHAIN_ID: "480",
  DEV_CIVILIZATION_WORLD_TOKEN_ADDRESS: LIVE_WORLD_TOKEN,
  DEV_PGHOST: "civilization-dev-postgres",
  DEV_PGDATABASE: "civilization_dev",
  DEV_PGUSER: "civilization_dev",
  PGHOST: "civilization-dev-postgres",
  PGDATABASE: "civilization_dev",
  PGUSER: "civilization_dev",
  WALLET_AUTH_RATE_LIMIT_SECRET: "a".repeat(32),
  WALLET_AUTH_TRUSTED_PROXY_HOPS: "1",
});

test("production runtime configuration accepts the canonical World Chain pair", () => {
  const configuration = runtimeConfiguration(productionEnvironment());

  assert.equal(configuration.ready, true);
  assert.deepEqual(configuration.missing, []);
  assert.equal(configuration.world.worldChainId, 480);
  assert.equal(configuration.world.worldTokenAddress, LIVE_WORLD_TOKEN);
});

test("a profile must be selected deliberately", () => {
  for (const CIVILIZATION_ENV of [undefined, "preview", "Production"]) {
    const configuration = runtimeConfiguration({
      ...productionEnvironment(),
      CIVILIZATION_ENV,
    });
    assert.equal(configuration.ready, false);
    assert.deepEqual(configuration.missing, ["CIVILIZATION_ENV"]);
  }
});

test("production runtime configuration fails closed when its token is missing", () => {
  const environment = productionEnvironment();
  delete environment.CIVILIZATION_WORLD_TOKEN_ADDRESS;

  const configuration = runtimeConfiguration(environment);

  assert.equal(configuration.ready, false);
  assert.deepEqual(configuration.missing, ["CIVILIZATION_WORLD_TOKEN_ADDRESS"]);
});

test("WalletAuth abuse controls require a secret and explicit proxy-hop contract", () => {
  const secretMissing = productionEnvironment();
  delete secretMissing.WALLET_AUTH_RATE_LIMIT_SECRET;
  assert.deepEqual(runtimeConfiguration(secretMissing).missing, [
    "WALLET_AUTH_RATE_LIMIT_SECRET",
  ]);
  assert.deepEqual(
    runtimeConfiguration({
      ...productionEnvironment(),
      WALLET_AUTH_TRUSTED_PROXY_HOPS: "one",
    }).missing,
    ["WALLET_AUTH_TRUSTED_PROXY_HOPS"],
  );
});

test("production runtime configuration rejects a wrong token or chain", () => {
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

test("development reads only DEV values and rejects a production contract", () => {
  const development = developmentEnvironment();
  const configuration = runtimeConfiguration({
    ...development,
    WORLD_APP_ID: "app_production",
    WALLET_AUTH_URL: "https://production.example.invalid",
    CIVILIZATION_CONTRACT_ADDRESS: LIVE_CONTRACT,
    CIVILIZATION_CHAIN_ID: "1",
    PGDATABASE: "production_database",
  });

  assert.equal(configuration.ready, false);
  assert.deepEqual(configuration.missing, ["DEV_PGDATABASE"]);
  assert.equal(configuration.world.worldAppId, development.DEV_WORLD_APP_ID);
  assert.equal(configuration.walletAuthUrl, development.DEV_WALLET_AUTH_URL);

  const productionContract = runtimeConfiguration({
    ...development,
    DEV_CIVILIZATION_CONTRACT_ADDRESS: LIVE_CONTRACT,
  });
  assert.equal(productionContract.ready, false);
  assert.deepEqual(productionContract.missing, [
    "DEV_CIVILIZATION_CONTRACT_ADDRESS",
  ]);
});

test("development rejects the canonical production WalletAuth origin", () => {
  const configuration = runtimeConfiguration({
    ...developmentEnvironment(),
    DEV_WALLET_AUTH_URL: "https://civilization.nyphon.de",
  });

  assert.equal(configuration.ready, false);
  assert.deepEqual(configuration.missing, ["DEV_WALLET_AUTH_URL"]);
});

test("development requires all Dev-specific World and database values", () => {
  const environment = developmentEnvironment();
  delete environment.DEV_WORLD_APP_ID;
  delete environment.DEV_WALLET_AUTH_URL;
  delete environment.DEV_PGHOST;

  const configuration = runtimeConfiguration(environment);
  assert.equal(configuration.ready, false);
  assert.deepEqual(configuration.missing, [
    "DEV_WALLET_AUTH_URL",
    "DEV_WORLD_APP_ID",
    "DEV_PGHOST",
  ]);
});
