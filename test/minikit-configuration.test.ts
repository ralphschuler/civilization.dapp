import assert from "node:assert/strict";
import test from "node:test";
import { miniKitProviderConfiguration } from "../src/lib/minikit-configuration.ts";
import {
  LIVE_CONTRACT,
  LIVE_WORLD_TOKEN,
  runtimeConfiguration,
} from "../src/lib/runtime-config.ts";

test("an unready runtime configuration cannot initialize MiniKit", () => {
  const configuration = runtimeConfiguration({
    WORLD_APP_ID: "app_production",
    WALLET_AUTH_URL: "https://civilization.example.invalid",
    CIVILIZATION_CONTRACT_ADDRESS: LIVE_CONTRACT,
    CIVILIZATION_CHAIN_ID: "480",
    CIVILIZATION_WORLD_TOKEN_ADDRESS: LIVE_WORLD_TOKEN,
  });

  assert.equal(configuration.ready, false);
  assert.equal(configuration.world.worldAppId, "app_production");
  assert.equal(miniKitProviderConfiguration(configuration), null);
});

test("a ready runtime configuration passes its World App ID to MiniKit", () => {
  const configuration = runtimeConfiguration({
    CIVILIZATION_ENV: "production",
    WORLD_APP_ID: "app_civilization",
    WALLET_AUTH_URL: "https://civilization.example.invalid",
    CIVILIZATION_CONTRACT_ADDRESS: LIVE_CONTRACT,
    CIVILIZATION_CHAIN_ID: "480",
    CIVILIZATION_WORLD_TOKEN_ADDRESS: LIVE_WORLD_TOKEN,
    WALLET_AUTH_RATE_LIMIT_SECRET: "a".repeat(32),
    WALLET_AUTH_TRUSTED_PROXY_HOPS: "1",
  });

  assert.deepEqual(miniKitProviderConfiguration(configuration), {
    appId: "app_civilization",
  });
});
