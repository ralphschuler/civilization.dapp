// This is public release metadata, not a transaction interface or credential
// configuration.
export const CONTRACT_STATUS = Object.freeze({
  release: "mainnet_dual_world_id_deployed_no_settlement",
  deployment: "worldchain_mainnet_dual_world_id_deployed",
  independentlyAudited: false,
  settlementEnabled: false,
  deployedContracts: Object.freeze([
    Object.freeze({
      name: "CivilizationGame",
      address: "0xfCdB50926c3c6b2CDF3ACE76B13c9383A2DC3199",
      chainId: 480,
      status: "mainnet_dual_world_id_deployed_not_independently_audited",
    }),
  ]),
  onChainActionsEnabled: true,
  custodyEnabled: false,
  paymentsEnabled: false,
  withdrawalsEnabled: false,
  contracts: Object.freeze([
    Object.freeze({ source: "contracts/src/CivilizationGame.sol", status: "mainnet_dual_world_id_deployed_not_independently_audited" }),
    Object.freeze({ source: "contracts/src/GameResourceToken.sol", status: "draft_not_deployed" }),
    Object.freeze({ source: "contracts/src/GoldSettlementRegistry.sol", status: "draft_not_deployed_allowlist_only" }),
  ]),
  requiredBeforeSettlement: Object.freeze([
    "independent security review",
    "approved settlement adapter with price and slippage controls",
    "liquidity, monitoring, and product/legal approval",
  ]),
});
