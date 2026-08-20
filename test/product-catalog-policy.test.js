import assert from "node:assert/strict";
import test from "node:test";
import { CONTRACT_STATUS } from "../server/contract-status.js";
import {
  evaluateProductCatalogProposal,
  PRODUCT_CATALOG_POLICY,
} from "../server/product-catalog-policy.js";

test("product catalogue is versioned, deeply immutable, and has no purchase UI", () => {
  assert.equal(PRODUCT_CATALOG_POLICY.version, "133.1");
  assert.equal(PRODUCT_CATALOG_POLICY.status, "disabled_source_only");
  assert.equal(PRODUCT_CATALOG_POLICY.purchaseUi.exposed, false);
  assert.deepEqual(PRODUCT_CATALOG_POLICY.purchaseUi.routes, []);
  assert.equal(Object.isFrozen(PRODUCT_CATALOG_POLICY), true);
  assert.equal(Object.isFrozen(PRODUCT_CATALOG_POLICY.purchaseUi), true);
  assert.equal(
    Object.isFrozen(PRODUCT_CATALOG_POLICY.paymentAdjacentSurfaces),
    true,
  );
  assert.equal(
    PRODUCT_CATALOG_POLICY.paymentAdjacentSurfaces.every((surface) =>
      surface.status.includes("only"),
    ),
    true,
  );
});

test("pre-activation kill switch has the exact issue #133 thresholds", () => {
  const { preActivationKillSwitch, telemetry } = PRODUCT_CATALOG_POLICY;
  assert.equal(preActivationKillSwitch.status, "non_active_launch_guardrails");
  assert.equal(preActivationKillSwitch.comparison, "strictly_greater_than");
  assert.deepEqual(preActivationKillSwitch.thresholds, {
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
  });
  assert.deepEqual(telemetry, {
    status: "absent_blocked_until_issue_48_and_privacy_baseline_approval",
    collectionEnabled: false,
  });
  assert.equal(Object.isFrozen(preActivationKillSwitch), true);
  assert.equal(Object.isFrozen(preActivationKillSwitch.thresholds), true);
});

test("product catalogue rejects activation and sensitive commercial fields", () => {
  const result = evaluateProductCatalogProposal({
    paymentsEnabled: true,
    offer: {
      price: 100,
      currency: "WLD",
      checkoutUrl: "https://example.invalid",
      credential: "not-retained",
    },
  });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, "payment_adjacent_fields_are_not_permitted");
  assert.deepEqual(result.fields, [
    "paymentsEnabled",
    "offer.price",
    "offer.currency",
    "offer.checkoutUrl",
    "offer.credential",
  ]);
  assert.equal(
    evaluateProductCatalogProposal({}).reason,
    "product_catalog_is_immutable",
  );
});

test("contract payment and custody flags are centrally fail-closed", () => {
  assert.equal(CONTRACT_STATUS.productCatalog, PRODUCT_CATALOG_POLICY);
  assert.deepEqual(
    {
      paymentsEnabled: CONTRACT_STATUS.paymentsEnabled,
      settlementEnabled: CONTRACT_STATUS.settlementEnabled,
      buybackEnabled: CONTRACT_STATUS.buybackEnabled,
      custodyEnabled: CONTRACT_STATUS.custodyEnabled,
      withdrawalsEnabled: CONTRACT_STATUS.withdrawalsEnabled,
    },
    PRODUCT_CATALOG_POLICY.contractStatusFlags,
  );
  assert.equal(
    Object.values(PRODUCT_CATALOG_POLICY.contractStatusFlags).every(
      (enabled) => enabled === false,
    ),
    true,
  );
  assert.equal(
    Object.entries(CONTRACT_STATUS)
      .filter(([key]) => key.toLowerCase().includes("enabled"))
      .map(([, value]) => value)
      .every((enabled) => enabled === false),
    true,
  );
});

