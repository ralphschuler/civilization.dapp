// Issue #133 is a catalogue boundary, not a payment implementation. Keep this
// module server-only so a future client cannot mistake metadata for an offer.
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

const forbiddenFieldPatterns = Object.freeze([
  /payment/i,
  /settlement/i,
  /buyback/i,
  /custody/i,
  /withdrawal/i,
  /price/i,
  /currency/i,
  /checkout/i,
  /credential/i,
  /(?:api)?key/i,
  /secret/i,
]);

function forbiddenFields(value, path = "") {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    const field = path ? `${path}.${key}` : key;
    return [
      ...(forbiddenFieldPatterns.some((pattern) => pattern.test(key))
        ? [field]
        : []),
      ...forbiddenFields(nested, field),
    ];
  });
}

/**
 * Versioned, immutable inventory of every payment-adjacent source currently
 * in this repository. None is a live product or a client-facing purchase
 * surface. A new version and the external approvals in ADR-0133 are required
 * before this policy can ever change.
 */
export const PRODUCT_CATALOG_POLICY = freeze({
  version: "133.1",
  status: "disabled_source_only",
  purchaseUi: { exposed: false, routes: Object.freeze([]) },
  contractStatusFlags: {
    paymentsEnabled: false,
    settlementEnabled: false,
    buybackEnabled: false,
    custodyEnabled: false,
    withdrawalsEnabled: false,
  },
  // These are pre-activation launch guardrails only. They do not authorize
  // collection, a trial, or any commercial surface.
  preActivationKillSwitch: {
    status: "non_active_launch_guardrails",
    comparison: "strictly_greater_than",
    thresholds: {
      refundRate: {
        value: 3,
        unit: "percent",
        numerator: "refunded completed purchases",
        denominator: "completed purchases",
      },
      buyerComplaintRate: {
        value: 0.5,
        unit: "percent",
        numerator: "unique buyers with one or more buyer complaints",
        denominator: "unique buyers with a completed purchase",
      },
      matchedD30ProgressionDelta: {
        value: 15,
        unit: "absolute percentage points",
        numerator:
          "absolute difference between matched purchaser and matched non-purchaser D30 progression-endpoint completion percentages",
        denominator: "each matched cohort",
      },
      pvpPowerDelta: {
        value: 10,
        unit: "percent of matched non-purchaser mean PvP power",
        numerator:
          "absolute difference between matched purchaser and matched non-purchaser mean PvP power",
        denominator: "matched non-purchaser mean PvP power",
      },
    },
  },
  telemetry: {
    status: "absent_blocked_until_issue_48_and_privacy_baseline_approval",
    collectionEnabled: false,
  },
  paymentAdjacentSurfaces: [
    {
      source: "contracts/src/GoldSettlementRegistry.sol",
      status: "source_only_not_deployed_allowlist_only",
    },
    {
      source: "contracts/src/CivilizationBuybackVault.sol",
      status: "source_only_not_deployed_timelock_configuration_required",
    },
    {
      source: "contracts/src/CivilizationRevenueSplitter.sol",
      status: "source_only_not_deployed",
    },
    {
      source: "scripts/plan-worldchain-market-v2.mjs",
      status: "offline_plan_only_not_a_client_or_checkout_surface",
    },
  ],
  rejectedFieldClasses: [
    "payment_activation",
    "price",
    "currency",
    "checkout",
    "credential",
  ],
});

/**
 * No runtime catalogue mutation is allowed. This deliberately rejects even a
 * benign proposal, and identifies payment-adjacent fields without returning
 * their values.
 */
export function evaluateProductCatalogProposal(proposal) {
  const fields = forbiddenFields(proposal);
  return freeze({
    accepted: false,
    reason:
      fields.length > 0
        ? "payment_adjacent_fields_are_not_permitted"
        : "product_catalog_is_immutable",
    fields,
  });
}

