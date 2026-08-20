// This is public release metadata, not a transaction interface or credential
// configuration.
export const CONTRACT_STATUS = Object.freeze({
  release: "mainnet_wallet_registration_deployed_no_settlement",
  deployment: "worldchain_mainnet_wallet_registration_deployed",
  independentlyAudited: false,
  settlementEnabled: false,
  buybackEnabled: false,
  deployedContracts: Object.freeze([
    Object.freeze({
      name: "CivilizationGame",
      address: "0x0E6689d0649Ad9037465d178231b10F18518D2b0",
      chainId: 480,
      status: "mainnet_wallet_registration_deployed_not_independently_audited",
    }),
  ]),
  // Wallet actions remain fail-closed until a V2 address/runtime hash is
  // published and the read-only verifier can establish a release baseline.
  onChainActionsEnabled: false,
  custodyEnabled: false,
  paymentsEnabled: false,
  withdrawalsEnabled: false,
  contracts: Object.freeze([
    Object.freeze({
      source: "contracts/src/CivilizationGame.sol",
      status: "mainnet_wallet_registration_deployed_not_independently_audited",
    }),
    Object.freeze({
      source: "contracts/src/GoldSettlementRegistry.sol",
      status: "draft_not_deployed_allowlist_only",
    }),
    Object.freeze({
      source: "contracts/src/CivilizationBuybackVault.sol",
      status: "source_only_not_deployed_timelock_configuration_required",
    }),
  ]),
  requiredBeforeSettlement: Object.freeze([
    "independent security review",
    "approved settlement adapter with price and slippage controls",
    "liquidity, monitoring, and product/legal approval",
  ]),
});
