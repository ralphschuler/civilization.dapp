// Server-only, read-only release verification.  Do not import this module in
// a client component: its RPC endpoint is an operational secret.
import { getAddress } from "viem";
import { verifyWorldChainProxy } from "../scripts/verify-worldchain-proxy.mjs";

// This is the historical implementation currently observed behind the proxy.
// It is intentionally a denial baseline, never a V2 release identity.
const HISTORICAL_V1_IMPLEMENTATION =
  "0x7330C22d7b61CCcDB7794435535aaB349D9aFF79";
const HISTORICAL_V1_IMPLEMENTATION_CODEHASH =
  "0x0a2ceb5853ae7ba5d020948baf97c08526f7d19ef990c3e3fc61c35ac794b12a";

export const WORLDCHAIN_RELEASE_BASELINE = Object.freeze({
  chainId: "480",
  proxy: "0x0E6689d0649Ad9037465d178231b10F18518D2b0",
  admin: "0x8351d16672bD54eAe8cd51Fc00E08aD8Adc4469D",
  timelock: "0x47CaD4ed6765e2aec7c569b2b1E7142D29d1530B",
  proxyCodeHash:
    "0x6ef08fd1df9261908a3870c0e7c652b38d4394eb5d5eff6cf86b82fb1b0209f9",
  adminCodeHash:
    "0x596a47f00033112fa6862ce8f8af0ab95443ea529e74be94637d5bab676420d2",
  worldAppId: "app_civilization",
  // The production V2 implementation address and runtime hash have not been
  // published. The historical V1 values are deliberately not a verification
  // baseline for this client release.
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
