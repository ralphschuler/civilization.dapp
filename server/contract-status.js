// This is public release metadata, not a transaction interface or credential
// configuration.
export const CONTRACT_STATUS = Object.freeze({
  release: "mainnet_deployed_no_settlement",
  deployment: "worldchain_mainnet_deployed",
  independentlyAudited: false,
  settlementEnabled: false,
  deployedContracts: Object.freeze([
    Object.freeze({
      name: "CivilizationGame",
      address: "0x29147c7bead901e8019d7911a7dc404447877c62",
      chainId: 480,
      status: "mainnet_deployed_not_independently_audited",
    }),
  ]),
  onChainActionsEnabled: true,
  custodyEnabled: false,
  paymentsEnabled: false,
  withdrawalsEnabled: false,
  contracts: Object.freeze([
    Object.freeze({ source: "contracts/src/CivilizationGame.sol", status: "mainnet_deployed_not_independently_audited" }),
    Object.freeze({ source: "contracts/src/GameResourceToken.sol", status: "draft_not_deployed" }),
    Object.freeze({ source: "contracts/src/GoldSettlementRegistry.sol", status: "draft_not_deployed_allowlist_only" }),
  ]),
  requiredBeforeSettlement: Object.freeze([
    "independent security review",
    "approved settlement adapter with price and slippage controls",
    "liquidity, monitoring, and product/legal approval",
  ]),
});
