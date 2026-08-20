import {
  WORLDCHAIN_RELEASE_BASELINE,
  assessWorldChainRelease,
} from "./contract-runtime-status.js";

const observedCapabilities = (report) => ({
  timelock: report.probes?.timelock?.abi === "timelock()",
  proxyAdminOwner: report.probes?.owner?.abi === "owner()",
  constructionCapacity:
    report.probes?.constructionCapacity?.status === "supported",
  constructionJob: report.probes?.constructionJob?.status === "supported",
  completeUpgrade:
    report.probes?.completeUpgradeSlot?.status === "supported_expected_revert",
});

/**
 * Production-only delivery decision. This function only invokes the existing
 * read-only verifier and returns a machine-readable, URL-free live result.
 */
export async function productionReleaseGate(configuration, dependencies = {}) {
  if (configuration.world?.environment !== "production")
    return { ok: false, status: "not_production" };
  const assessment = await assessWorldChainRelease(configuration, dependencies);
  const report = assessment.report;
  return {
    ok: assessment.status === "verified",
    status: assessment.status,
    required: {
      chainId: WORLDCHAIN_RELEASE_BASELINE.chainId,
      proxy: WORLDCHAIN_RELEASE_BASELINE.proxy,
      implementation: configuration.worldchainRelease.implementationAddress,
      implementationCodeHash:
        configuration.worldchainRelease.implementationCodeHash,
      proxyCodeHash: WORLDCHAIN_RELEASE_BASELINE.proxyCodeHash,
      requiredCapabilities: WORLDCHAIN_RELEASE_BASELINE.requiredCapabilities,
    },
    ...(report
      ? {
          observed: {
            chainId: report.chainId,
            proxy: report.proxy,
            implementation: report.implementation,
            admin: report.admin,
            capabilities: observedCapabilities(report),
          },
        }
      : {}),
  };
}
