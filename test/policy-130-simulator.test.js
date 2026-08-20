import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_OFFLINE_SECONDS,
  MAX_REDUCTION_BPS,
  SIMULATOR_VERSION,
  canStartWorkshopJob,
  cappedOfflineSeconds,
  compareCurves,
  rawDurationSeconds,
  reductionBps,
  simulateJob,
  workshopSlots,
} from "../src/simulation/policy-130-simulator.js";

test("Issue 130 simulator supports every class and only levels 1 through 30", () => {
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
