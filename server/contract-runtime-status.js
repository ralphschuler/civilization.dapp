// Server-only, read-only release verification.  Do not import this module in
// a client component: its RPC endpoint is an operational secret.
import { getAddress } from "viem";
import { verifyWorldChainProxy } from "../scripts/verify-worldchain-proxy.mjs";

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

function matchesObservedIdentity(report, configuration) {
  const b = WORLDCHAIN_RELEASE_BASELINE;
  return (
    configuration.world.worldChainId === Number(b.chainId) &&
    sameAddress(configuration.world.civilizationContractAddress, b.proxy) &&
    configuration.world.worldAppId === b.worldAppId &&
    report.chainId === b.chainId &&
    sameAddress(report.proxy.address, b.proxy) &&
    sameAddress(report.admin.address, b.admin) &&
    sameAddress(report.authority.proxyTimelock, b.timelock) &&
    sameAddress(report.authority.proxyAdminOwner, b.timelock) &&
    report.proxy.code.hash === b.proxyCodeHash &&
    report.admin.code.hash === b.adminCodeHash
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
      const report = await verify({
        rpcUrl: configuration.worldchainRpcUrl,
        proxy: WORLDCHAIN_RELEASE_BASELINE.proxy,
        expectedChainId: WORLDCHAIN_RELEASE_BASELINE.chainId,
      });
      // No V2 implementation address/codehash is published yet. An observed
      // V1 or any ABI mismatch is explicitly mismatched; even a compatible
      // candidate remains unverified rather than being promoted to a made-up
      // V2 release baseline.
      const status =
        !matchesObservedIdentity(report, configuration) ||
        !hasRequiredCapabilities(report)
          ? "mismatched"
          : "unverified";
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
