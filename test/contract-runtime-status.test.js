import assert from "node:assert/strict";
import test from "node:test";
import {
  WORLDCHAIN_RELEASE_BASELINE as baseline,
  contractRuntimeStatus,
  resetContractRuntimeStatusCacheForTest,
} from "../server/contract-runtime-status.js";

const configuration = (overrides = {}) => ({
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
  ...overrides,
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

const historicalV1Observation = () => ({
  ...reviewedV2Observation(),
  implementation: {
    address: "0x7330C22d7b61CCcDB7794435535aaB349D9aFF79",
    code: {
      hash: "0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a",
    },
  },
});

test("runtime verifier caches an exact reviewed V2 identity and capability match", async () => {
  resetContractRuntimeStatusCacheForTest();
  let calls = 0;
  const verify = async () => {
    calls += 1;
    return reviewedV2Observation();
  };
  const [first, second] = await Promise.all([
    contractRuntimeStatus(configuration(), { verify }),
    contractRuntimeStatus(configuration(), { verify }),
  ]);
  assert.equal(first.status, "verified");
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
  assert.deepEqual(first.requiredCapabilities, [
    "timelock()",
    "owner()",
    "constructionCapacity()",
    "constructionJob(address,uint8)",
    "completeUpgrade(uint8)",
  ]);
});

test("historical V1 identity is mismatched even when a fixture claims every V2 capability", async () => {
  resetContractRuntimeStatusCacheForTest();
  const result = await contractRuntimeStatus(
    configuration({
      worldchainRelease: {
        implementationAddress: "0x7330C22d7b61CCcDB7794435535aaB349D9aFF79",
        implementationCodeHash:
          "0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a",
      },
    }),
    { verify: async () => historicalV1Observation() },
  );
  assert.equal(result.status, "mismatched");
});

test("missing live V2 capabilities is mismatched rather than verified", async () => {
  resetContractRuntimeStatusCacheForTest();
  const result = await contractRuntimeStatus(configuration(), {
    verify: async () => ({
      ...reviewedV2Observation(),
      probes: {
        ...reviewedV2Observation().probes,
        constructionCapacity: { status: "unsupported_or_reverted" },
        constructionJob: { status: "unsupported_or_reverted" },
        completeUpgradeSlot: { status: "unsupported_or_reverted" },
      },
    }),
  });
  assert.equal(result.status, "mismatched");
});

test("runtime mismatch and verifier failures fail closed without RPC/provider leakage", async () => {
  resetContractRuntimeStatusCacheForTest();
  const mismatch = await contractRuntimeStatus(
    configuration({ worldchainRpcUrl: "https://mismatch-rpc.example.invalid" }),
    {
      verify: async () => ({
        ...reviewedV2Observation(),
        admin: {
          address: baseline.proxy,
          code: {
            hash: baseline.adminCodeHash,
          },
        },
      }),
    },
  );
  assert.equal(mismatch.status, "mismatched");
  resetContractRuntimeStatusCacheForTest();
  const failed = await contractRuntimeStatus(
    configuration({ worldchainRpcUrl: "https://failed-rpc.example.invalid" }),
    {
      verify: async () => {
        throw new Error("https://secret-rpc.invalid credential rejected");
      },
    },
  );
  assert.equal(failed.status, "failed");
  assert.doesNotMatch(JSON.stringify(failed), /secret-rpc|credential|https:/);
});

test("missing RPC configuration is not ready and is never passed to a verifier", async () => {
  resetContractRuntimeStatusCacheForTest();
  const result = await contractRuntimeStatus(
    configuration({ ready: false, worldchainRpcUrl: "" }),
    {
      verify: async () => {
        throw new Error("must_not_run");
      },
    },
  );
  assert.equal(result.status, "missing_configuration");
});

test("development never probes or reports the production release identity", async () => {
  resetContractRuntimeStatusCacheForTest();
  const development = configuration();
  development.world.environment = "development";
  const result = await contractRuntimeStatus(development, {
    verify: async () => {
      throw new Error("must_not_run");
    },
  });
  assert.equal(result.status, "not_production");
});
