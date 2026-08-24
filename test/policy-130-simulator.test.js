import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECT_CONSTRUCTION_BOOST_WLD_EQUIVALENT_PER_HOUR,
  MONTHLY_PAID_ADVANTAGE_CAP_WLD_EQUIVALENT,
  MAX_OFFLINE_SECONDS,
  MAX_REDUCTION_BPS,
  SIMULATOR_VERSION,
  canStartWorkshopJob,
  cappedOfflineSeconds,
  compareCurves,
  evaluateDirectConstructionBoost,
  evaluateMonthlyPaidAdvantage,
  rawDurationSeconds,
  reductionBps,
  simulateJob,
  workshopSlots,
} from "../src/simulation/policy-130-simulator.js";

test("monthly paid-advantage cap aggregates supplied WLD-equivalent routes", () => {
  const priorCgoldPurchaseEquivalent = 3n * 10n ** 18n;
  const directBoost = evaluateDirectConstructionBoost({
    priorMonthlyWldEquivalent: priorCgoldPurchaseEquivalent,
    requestedHours: 2,
  });
  assert.equal(directBoost.allowed, true);
  assert.equal(directBoost.admittedHours, 2);
  assert.equal(directBoost.admittedWldEquivalent, 2n * 10n ** 18n);

  const beyondAggregateCap = evaluateMonthlyPaidAdvantage({
    priorMonthlyWldEquivalent:
      priorCgoldPurchaseEquivalent + directBoost.admittedWldEquivalent,
    requestedWldEquivalent: 1n,
  });
  assert.deepEqual(beyondAggregateCap, {
    capWldEquivalent: MONTHLY_PAID_ADVANTAGE_CAP_WLD_EQUIVALENT,
    priorMonthlyWldEquivalent: MONTHLY_PAID_ADVANTAGE_CAP_WLD_EQUIVALENT,
    requestedWldEquivalent: 1n,
    remainingWldEquivalent: 0n,
    admittedWldEquivalent: 0n,
    rejectedWldEquivalent: 1n,
    allowed: false,
    rejectionReason: "monthly_paid_advantage_cap_exceeded",
  });
});

test("monthly paid-advantage cap admits its exact boundary and rejects excess", () => {
  const exact = evaluateMonthlyPaidAdvantage({
    priorMonthlyWldEquivalent: 4n * 10n ** 18n,
    requestedWldEquivalent: 1n * 10n ** 18n,
  });
  assert.equal(exact.allowed, true);
  assert.equal(exact.remainingWldEquivalent, 1n * 10n ** 18n);
  assert.equal(exact.admittedWldEquivalent, 1n * 10n ** 18n);

  const excess = evaluateMonthlyPaidAdvantage({
    priorMonthlyWldEquivalent: 4n * 10n ** 18n,
    requestedWldEquivalent: 1n * 10n ** 18n + 1n,
  });
  assert.equal(excess.allowed, false);
  assert.equal(excess.admittedWldEquivalent, 0n);
  assert.equal(excess.rejectedWldEquivalent, 1n * 10n ** 18n + 1n);
  assert.equal(excess.rejectionReason, "monthly_paid_advantage_cap_exceeded");

  const beyondFiveWld = evaluateMonthlyPaidAdvantage({
    priorMonthlyWldEquivalent: 0n,
    requestedWldEquivalent: 6n * 10n ** 18n,
  });
  assert.equal(beyondFiveWld.allowed, false);
  assert.equal(beyondFiveWld.rejectedWldEquivalent, 6n * 10n ** 18n);
});

test("direct construction boosts have a five-hour monthly boundary", () => {
  const fiveHours = evaluateDirectConstructionBoost({
    priorMonthlyWldEquivalent: 0n,
    requestedHours: 5,
  });
  assert.equal(fiveHours.allowed, true);
  assert.equal(fiveHours.requestedWldEquivalent, 5n * 10n ** 18n);
  assert.equal(fiveHours.admittedHours, 5);

  const sixHours = evaluateDirectConstructionBoost({
    priorMonthlyWldEquivalent: 0n,
    requestedHours: 6,
  });
  assert.equal(
    DIRECT_CONSTRUCTION_BOOST_WLD_EQUIVALENT_PER_HOUR,
    1n * 10n ** 18n,
  );
  assert.equal(sixHours.allowed, false);
  assert.equal(sixHours.admittedHours, 0);
});

test("paid-advantage policy rejects invalid inputs and is deterministic", () => {
  assert.throws(
    () =>
      evaluateMonthlyPaidAdvantage({
        priorMonthlyWldEquivalent: -1n,
        requestedWldEquivalent: 1n,
      }),
    /invalid_prior_monthly_wld_equivalent/,
  );
  assert.throws(
    () =>
      evaluateMonthlyPaidAdvantage({
        priorMonthlyWldEquivalent: 0n,
        requestedWldEquivalent: 0n,
      }),
    /invalid_requested_wld_equivalent/,
  );
  assert.throws(
    () =>
      evaluateDirectConstructionBoost({
        priorMonthlyWldEquivalent: 0n,
        requestedHours: 1.5,
      }),
    /invalid_requested_boost_hours/,
  );
  assert.throws(
    () =>
      evaluateDirectConstructionBoost({
        priorMonthlyWldEquivalent:
          MONTHLY_PAID_ADVANTAGE_CAP_WLD_EQUIVALENT + 1n,
        requestedHours: 1,
      }),
    /invalid_prior_monthly_wld_equivalent/,
  );

  const input = {
    priorMonthlyWldEquivalent: 2n * 10n ** 18n,
    requestedWldEquivalent: 2n * 10n ** 18n,
  };
  assert.deepEqual(
    evaluateMonthlyPaidAdvantage(input),
    evaluateMonthlyPaidAdvantage(input),
  );
});

test("Issue 130 simulator supports every class and only levels 1 through 30", () => {
  assert.equal(
    simulateJob({ buildingClass: "civic", level: 1, version: "130.1" }).version,
    "130.1",
  );
  for (const buildingClass of [
    "production",
    "logistics",
    "military",
    "civic",
  ]) {
    assert.equal(
      simulateJob({ buildingClass, level: 1 }).version,
      SIMULATOR_VERSION,
    );
    assert.ok(
      rawDurationSeconds({ buildingClass, level: 30 }) >
        rawDurationSeconds({ buildingClass, level: 1 }),
    );
  }
  assert.throws(
    () => simulateJob({ buildingClass: "civic", level: 31 }),
    /invalid_level/,
  );
});

test("duration rounding is always upward after each curve step and reduction", () => {
  assert.equal(
    rawDurationSeconds({
      buildingClass: "production",
      level: 2,
      curve: "accelerated",
    }),
    545,
  );
  const result = simulateJob({
    buildingClass: "production",
    level: 2,
    curve: "accelerated",
    boosts: ["rested"],
  });
  assert.equal(result.durationSeconds, 491); // ceil(545 * 0.90)
});

test("boost combinations deduplicate, cap at 35 percent, and retain the minimum", () => {
  assert.equal(reductionBps(["rested", "rested"]), 1_000);
  assert.equal(
    reductionBps(["rested", "cooperative", "migration"]),
    MAX_REDUCTION_BPS,
  );
  const boosted = simulateJob({
    buildingClass: "production",
    level: 1,
    boosts: ["rested", "cooperative", "migration"],
  });
  assert.equal(boosted.appliedReductionBps, MAX_REDUCTION_BPS);
  assert.equal(boosted.durationSeconds, 312);
  assert.throws(() => reductionBps(["unknown"]), /invalid_boost/);
});

test("workshop slots and the 72-hour offline cap are explicit", () => {
  assert.deepEqual(
    [0, 1, 10, 11, 20, 21, 30].map(workshopSlots),
    [0, 1, 1, 2, 2, 3, 3],
  );
  assert.equal(canStartWorkshopJob({ workshopLevel: 11, activeJobs: 1 }), true);
  assert.equal(
    canStartWorkshopJob({ workshopLevel: 11, activeJobs: 2 }),
    false,
  );
  assert.equal(cappedOfflineSeconds(-10), 0);
  assert.equal(
    cappedOfflineSeconds(MAX_OFFLINE_SECONDS + 1),
    MAX_OFFLINE_SECONDS,
  );
});

test("D1, D7, and D30 comparison is deterministic and compares two curves", () => {
  const rows = compareCurves({ buildingClass: "civic" });
  assert.deepEqual(
    rows.map(({ days }) => days),
    [1, 7, 30],
  );
  for (const row of rows)
    assert.ok(row.accelerated.completedLevels >= row.steady.completedLevels);
  assert.deepEqual(compareCurves({ buildingClass: "civic" }), rows);
});
