// Server-only, read-only release verification.  Do not import this module in
// a client component: its RPC endpoint is an operational secret.
import { getAddress } from "viem";
import { verifyWorldChainProxy } from "../scripts/verify-worldchain-proxy.mjs";

// Historical V1 is a denial baseline, never a V2 release identity.
const HISTORICAL_V1_IMPLEMENTATION =
  "0x7330C22d7b61CCcDB7794435535aaB349D9aFF79";
const HISTORICAL_V1_IMPLEMENTATION_CODEHASH =
  "0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a";

export const WORLDCHAIN_RELEASE_BASELINE = Object.freeze({
  chainId: "480",
  proxy: "0x99976f2f170F17a14ae6c69cEb8Cb31d47366764",
  admin: "0x7Fb08C7B18c4F1Df2de673449cD444bD75c10727",
  timelock: "0xB32b6d663C4B8e7720F63782d674cffA827799eb",
  proxyCodeHash:
    "0x27be4abd1bfdea24045ea14f966fca677e89f68bc6357c94639792245fdf30b1",
  adminCodeHash:
    "0x9bf47c74c8d31bc85cbad752d32b5934e573556fd716626de5af96db240e0738",
  worldAppId: "app_fb58623423375293a26d7e54209514e8",
  requiredCapabilities: Object.freeze([
    "timelock()",
    "owner()",
    "constructionCapacity()",
    "constructionJob(address,uint8)",
    "completeUpgrade(uint8)",
  ]),
});

const CACHE_TTL_MS = 30_000;
let cached;
let inFlight;
const sameAddress = (left, right) => getAddress(left) === getAddress(right);

function isReviewedV2Identity(implementation) {
  return (
    !sameAddress(
      implementation.implementationAddress,
      HISTORICAL_V1_IMPLEMENTATION,
    ) &&
    implementation.implementationCodeHash !==
      HISTORICAL_V1_IMPLEMENTATION_CODEHASH
  );
}

function matchesObservedIdentity(report, configuration) {
  const b = WORLDCHAIN_RELEASE_BASELINE;
  const expectedImplementation = configuration.worldchainRelease;
  return (
    isReviewedV2Identity(expectedImplementation) &&
    !sameAddress(report.implementation.address, HISTORICAL_V1_IMPLEMENTATION) &&
    report.implementation.code.hash !== HISTORICAL_V1_IMPLEMENTATION_CODEHASH &&
    configuration.world.worldChainId === Number(b.chainId) &&
    sameAddress(configuration.world.civilizationContractAddress, b.proxy) &&
    configuration.world.worldAppId === b.worldAppId &&
    report.chainId === b.chainId &&
    sameAddress(report.proxy.address, b.proxy) &&
    sameAddress(report.admin.address, b.admin) &&
    sameAddress(report.authority.proxyTimelock, b.timelock) &&
    sameAddress(report.authority.proxyAdminOwner, b.timelock) &&
    report.proxy.code.hash === b.proxyCodeHash &&
    report.admin.code.hash === b.adminCodeHash &&
    sameAddress(
      report.implementation.address,
      expectedImplementation.implementationAddress,
    ) &&
    report.implementation.code.hash ===
      expectedImplementation.implementationCodeHash
  );
}

function hasRequiredCapabilities(report) {
  return (
    report.probes?.timelock?.abi === "timelock()" &&
    report.probes?.owner?.abi === "owner()" &&
    report.probes?.constructionCapacity?.status === "supported" &&
    Number.isInteger(report.probes.constructionCapacity.value) &&
    report.probes.constructionCapacity.value >= 2 &&
    report.probes?.constructionJob?.status === "supported" &&
    report.probes?.completeUpgradeSlot?.status === "supported_expected_revert"
  );
}

function sanitized(status, observedAt) {
  return {
    status,
    observedAt,
    requiredCapabilities: WORLDCHAIN_RELEASE_BASELINE.requiredCapabilities,
  };
}

/**
 * Assess the configured production release against a live, read-only RPC
 * observation. The returned object intentionally contains no RPC URL or RPC
 * error data, so it is safe for delivery logs and machine processing.
 */
export async function assessWorldChainRelease(
  configuration,
  { verify = verifyWorldChainProxy } = {},
) {
  if (!configuration.ready || !configuration.worldchainRpcUrl)
    return { status: "missing_configuration" };
  try {
    const report = await verify({
      rpcUrl: configuration.worldchainRpcUrl,
      proxy: configuration.world.civilizationContractAddress,
      expectedChainId: configuration.world.worldChainId,
    });
    return {
      status:
        matchesObservedIdentity(report, configuration) &&
        hasRequiredCapabilities(report)
          ? "verified"
          : "mismatched",
      report,
    };
  } catch {
    return { status: "failed" };
  }
}

/** Returns only safe status labels and timestamps; provider URLs/errors never escape. */
export async function contractRuntimeStatus(
  configuration,
  { now = Date.now, verify = verifyWorldChainProxy } = {},
) {
  if (configuration.world?.environment !== "production")
    return sanitized("not_production", new Date(now()).toISOString());
  if (!configuration.ready || !configuration.worldchainRpcUrl)
    return sanitized("missing_configuration", new Date(now()).toISOString());
  const current = now();
  const cacheKey = JSON.stringify([
    configuration.worldchainRpcUrl,
    configuration.world.worldAppId,
    configuration.world.civilizationContractAddress,
  ]);
  if (cached && cached.key === cacheKey && current - cached.at < CACHE_TTL_MS)
    return cached.value;
  if (inFlight?.key === cacheKey) return inFlight.promise;
  const promise = (async () => {
    const observedAt = new Date(now()).toISOString();
    try {
      const { status } = await assessWorldChainRelease(configuration, {
        verify,
      });
      const value = sanitized(status, observedAt);
      cached = { key: cacheKey, at: now(), value };
      return value;
    } catch {
      const value = sanitized("failed", observedAt);
      cached = { key: cacheKey, at: now(), value };
      return value;
    } finally {
      if (inFlight?.key === cacheKey) inFlight = undefined;
    }
  })();
  inFlight = { key: cacheKey, promise };
  return promise;
}

export function resetContractRuntimeStatusCacheForTest() {
  cached = undefined;
  inFlight = undefined;
}
