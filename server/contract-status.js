// This is release metadata, not a deployment configuration. In particular it
// contains no contract addresses, credentials, or transaction capability.
export const CONTRACT_STATUS = Object.freeze({
  release: "beta_quote_only",
  deployment: "not_deployed",
  deployedContracts: Object.freeze([]),
  onChainActionsEnabled: false,
  custodyEnabled: false,
  paymentsEnabled: false,
  withdrawalsEnabled: false,
  contracts: Object.freeze([
    Object.freeze({ source: "contracts/src/GameResourceToken.sol", status: "draft_not_deployed" }),
    Object.freeze({ source: "contracts/src/GoldSettlementRegistry.sol", status: "draft_not_deployed_allowlist_only" }),
    Object.freeze({ source: "contracts/src/IdleCoin.sol", status: "legacy_draft_not_deployed" }),
  ]),
  requiredBeforeDeployment: Object.freeze([
    "independent security review",
    "approved settlement adapter with price and slippage controls",
    "liquidity, monitoring, and product/legal approval",
  ]),
});
