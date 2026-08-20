import assert from "node:assert/strict";
import test from "node:test";
import { WORLDCHAIN_RELEASE_BASELINE as baseline } from "../server/contract-runtime-status.js";
import { productionReleaseGate } from "../server/production-release-gate.js";

const configuration = () => ({
  ready: true,
  worldchainRpcUrl: "https://rpc.example.invalid/private-path",
  world: {
    environment: "production",
    worldChainId: 480,
    civilizationContractAddress: baseline.proxy,
    worldAppId: baseline.worldAppId,
  },
  worldchainRelease: {
    implementationAddress: "0x0000000000000000000000000000000000000002",
    implementationCodeHash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
});

const reviewedV2Observation = () => ({
  chainId: "480",
  proxy: { address: baseline.proxy, code: { hash: baseline.proxyCodeHash } },
  implementation: {
    address: "0x0000000000000000000000000000000000000002",
    code: {
      hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
  },
  admin: { address: baseline.admin, code: { hash: baseline.adminCodeHash } },
  authority: {
    proxyTimelock: baseline.timelock,
    proxyAdminOwner: baseline.timelock,
  },
  probes: {
    timelock: { abi: "timelock()" },
    owner: { abi: "owner()" },
    constructionCapacity: { status: "supported", value: 3 },
    constructionJob: { status: "supported" },
    completeUpgradeSlot: { status: "supported_expected_revert" },
  },
});

test("production delivery gate emits a machine-readable reviewed V2 observation", async () => {
  const result = await productionReleaseGate(configuration(), {
    verify: async () => reviewedV2Observation(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "verified");
  assert.equal(
    result.observed.implementation.address,
    configuration().worldchainRelease.implementationAddress,
  );
  assert.deepEqual(result.observed.capabilities, {
    timelock: true,
    proxyAdminOwner: true,
    constructionCapacity: true,
    constructionJob: true,
    completeUpgrade: true,
  });
  assert.doesNotMatch(JSON.stringify(result), /rpc\.example|private-path/);
});

test("historical V1 identity fails the production gate despite V2-named fixture capabilities", async () => {
  const v1Configuration = configuration();
  v1Configuration.worldchainRelease = {
    implementationAddress: "0x7330C22d7b61CCcDB7794435535aaB349D9aFF79",
    implementationCodeHash:
      "0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a",
  };
  const result = await productionReleaseGate(v1Configuration, {
    verify: async () => ({
      ...reviewedV2Observation(),
      implementation: {
        address: "0x7330C22d7b61CCcDB7794435535aaB349D9aFF79",
        code: {
          hash: "0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a",
        },
      },
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "mismatched");
  assert.equal(result.observed.capabilities.constructionCapacity, true);
  assert.equal(result.observed.capabilities.completeUpgrade, true);
});

test("delivery gate never runs against a development configuration", async () => {
  const development = configuration();
  development.world.environment = "development";
  const result = await productionReleaseGate(development, {
    verify: async () => {
      throw new Error("must_not_run");
    },
  });
  assert.deepEqual(result, { ok: false, status: "not_production" });
});
