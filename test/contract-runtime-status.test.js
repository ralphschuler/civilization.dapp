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
    worldChainId: 480,
    civilizationContractAddress: baseline.proxy,
    worldAppId: baseline.worldAppId,
  },
  ...overrides,
});
const observed = () => ({
  chainId: "480",
  proxy: { address: baseline.proxy, code: { hash: baseline.proxyCodeHash } },
  implementation: {
    address: "0x7330C22d7b61CCcDB7794435535aaB349D9aFF79",
    code: {
      hash: "0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a",
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

test("runtime verifier caches a capability-compatible candidate but does not invent a V2 verification baseline", async () => {
  resetContractRuntimeStatusCacheForTest();
  let calls = 0;
  const verify = async () => {
    calls += 1;
    return observed();
  };
  const [first, second] = await Promise.all([
    contractRuntimeStatus(configuration(), { verify }),
    contractRuntimeStatus(configuration(), { verify }),
  ]);
  assert.equal(first.status, "unverified");
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

test("known V1 missing queue selectors is mismatched rather than verified", async () => {
  resetContractRuntimeStatusCacheForTest();
  const result = await contractRuntimeStatus(configuration(), {
    verify: async () => ({
      ...observed(),
      probes: {
        ...observed().probes,
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
        ...observed(),
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
