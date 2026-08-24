// This is public release metadata, not a transaction interface or credential
// configuration.
import { PRODUCT_CATALOG_POLICY } from "./product-catalog-policy.js";

export const CONTRACT_STATUS = Object.freeze({
  release: "mainnet_wallet_registration_deployed_no_settlement",
  deployment: "worldchain_mainnet_wallet_registration_deployed",
  independentlyAudited: false,
  ...PRODUCT_CATALOG_POLICY.contractStatusFlags,
  deployedContracts: Object.freeze([
    Object.freeze({
      name: "CivilizationGame",
      address: "0x99976f2f170F17a14ae6c69cEb8Cb31d47366764",
      chainId: 480,
      status: "mainnet_wallet_registration_deployed_not_independently_audited",
    }),
  ]),
  // Settlement remains fail-closed; game runtime readiness is established by
  // the separate read-only V2 verifier.
  onChainActionsEnabled: false,
  productCatalog: PRODUCT_CATALOG_POLICY,
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
