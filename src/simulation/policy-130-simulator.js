/**
 * Issue #130 proposal simulator.  This module has no chain, wallet, clock, or
 * production-config dependency: callers supply every input and receive a pure
 * deterministic projection.
 */
export const SIMULATOR_VERSION = "130.2";
export const MAX_LEVEL = 30;
export const MAX_OFFLINE_SECONDS = 72 * 60 * 60;
export const MIN_JOB_SECONDS = 60;
export const MAX_REDUCTION_BPS = 3_500;
/** Exact accounting unit for supplied WLD-equivalent amounts. */
export const WLD_EQUIVALENT_UNIT = 10n ** 18n;
export const MONTHLY_PAID_ADVANTAGE_CAP_WLD = 5n;
export const MONTHLY_PAID_ADVANTAGE_CAP_WLD_EQUIVALENT =
  MONTHLY_PAID_ADVANTAGE_CAP_WLD * WLD_EQUIVALENT_UNIT;
export const DIRECT_CONSTRUCTION_BOOST_WLD_EQUIVALENT_PER_HOUR =
  WLD_EQUIVALENT_UNIT;

export const BUILDING_CLASSES = Object.freeze([
  "production",
  "logistics",
  "military",
  "civic",
]);

const POLICY_130_1 = Object.freeze({
  version: "130.1",
  // Base duration is intentionally class-specific; all calculations below are
  // integer seconds, so the result is reproducible on every supported runtime.
  baseSeconds: Object.freeze({
    production: 8 * 60,
    logistics: 10 * 60,
    military: 12 * 60,
    civic: 15 * 60,
  }),
  curves: Object.freeze({
    steady: 11_800,
    accelerated: 11_350,
  }),
  boostBps: Object.freeze({
    rested: 1_000,
    cooperative: 1_500,
    migration: 2_000,
  }),
});

const POLICY_130_2 = Object.freeze({
  ...POLICY_130_1,
  version: SIMULATOR_VERSION,
});

export const SIMULATOR_POLICIES = Object.freeze({
  130.1: POLICY_130_1,
  [SIMULATOR_VERSION]: POLICY_130_2,
});

function ceilDiv(numerator, denominator) {
  return Math.floor((numerator + denominator - 1) / denominator);
}

function requireInteger(value, name) {
  if (!Number.isSafeInteger(value)) throw new Error(`invalid_${name}`);
}

function requirePositiveBigInt(value, name) {
  if (typeof value !== "bigint" || value <= 0n)
    throw new Error(`invalid_${name}`);
}

function requireMonthlyUsage(value, name) {
  if (
    typeof value !== "bigint" ||
    value < 0n ||
    value > MONTHLY_PAID_ADVANTAGE_CAP_WLD_EQUIVALENT
  )
    throw new Error(`invalid_${name}`);
}

export function policyFor(version = SIMULATOR_VERSION) {
  const policy = SIMULATOR_POLICIES[version];
  if (!policy) throw new Error("unsupported_simulator_version");
  return policy;
}

/**
 * Evaluates one requested paid advantage against a caller-supplied calendar
 * month's already-used WLD-equivalent total. Amounts are bigint WLD wei
 * equivalents: callers must establish any future CGOLD valuation elsewhere.
 * This is an all-or-nothing admission check and has no wallet or clock state.
 */
export function evaluateMonthlyPaidAdvantage({
  priorMonthlyWldEquivalent,
  requestedWldEquivalent,
}) {
  requireMonthlyUsage(
    priorMonthlyWldEquivalent,
    "prior_monthly_wld_equivalent",
  );
  requirePositiveBigInt(requestedWldEquivalent, "requested_wld_equivalent");

  const remainingWldEquivalent =
    MONTHLY_PAID_ADVANTAGE_CAP_WLD_EQUIVALENT - priorMonthlyWldEquivalent;
  const allowed = requestedWldEquivalent <= remainingWldEquivalent;
  return Object.freeze({
    capWldEquivalent: MONTHLY_PAID_ADVANTAGE_CAP_WLD_EQUIVALENT,
    priorMonthlyWldEquivalent,
    requestedWldEquivalent,
    remainingWldEquivalent,
    admittedWldEquivalent: allowed ? requestedWldEquivalent : 0n,
    rejectedWldEquivalent: allowed ? 0n : requestedWldEquivalent,
    allowed,
    rejectionReason: allowed ? null : "monthly_paid_advantage_cap_exceeded",
  });
}

/**
 * Direct construction boosts cost exactly one WLD per requested full hour in
 * the current contract. This adapter makes that route consume the same budget.
 */
export function evaluateDirectConstructionBoost({
  priorMonthlyWldEquivalent,
  requestedHours,
}) {
  requireInteger(requestedHours, "requested_boost_hours");
  if (requestedHours <= 0) throw new Error("invalid_requested_boost_hours");

  const requestedWldEquivalent =
    BigInt(requestedHours) * DIRECT_CONSTRUCTION_BOOST_WLD_EQUIVALENT_PER_HOUR;
  const decision = evaluateMonthlyPaidAdvantage({
    priorMonthlyWldEquivalent,
    requestedWldEquivalent,
  });
  return Object.freeze({
    ...decision,
    requestedHours,
    admittedHours: decision.allowed ? requestedHours : 0,
  });
}

export function workshopSlots(level) {
  requireInteger(level, "workshop_level");
  if (level < 0 || level > MAX_LEVEL) throw new Error("invalid_workshop_level");
  if (level === 0) return 0;
  return Math.ceil(level / 10);
}

export function canStartWorkshopJob({ workshopLevel, activeJobs }) {
  requireInteger(activeJobs, "active_jobs");
  if (activeJobs < 0) throw new Error("invalid_active_jobs");
  return activeJobs < workshopSlots(workshopLevel);
}

export function cappedOfflineSeconds(elapsedSeconds) {
  requireInteger(elapsedSeconds, "offline_seconds");
  return Math.min(MAX_OFFLINE_SECONDS, Math.max(0, elapsedSeconds));
}

export function reductionBps(boosts = [], version = SIMULATOR_VERSION) {
  const { boostBps } = policyFor(version);
  if (!Array.isArray(boosts)) throw new Error("invalid_boosts");
  const unique = new Set(boosts);
  let total = 0;
  for (const boost of unique) {
    if (!Object.hasOwn(boostBps, boost)) throw new Error("invalid_boost");
    total += boostBps[boost];
  }
  return Math.min(MAX_REDUCTION_BPS, total);
}

export function rawDurationSeconds({
  buildingClass,
  level,
  curve = "steady",
  version = SIMULATOR_VERSION,
}) {
  const policy = policyFor(version);
  requireInteger(level, "level");
  if (level < 1 || level > MAX_LEVEL) throw new Error("invalid_level");
  if (!Object.hasOwn(policy.baseSeconds, buildingClass))
    throw new Error("invalid_building_class");
  const growthBps = policy.curves[curve];
  if (!growthBps) throw new Error("invalid_curve");
  let duration = policy.baseSeconds[buildingClass];
  for (let currentLevel = 1; currentLevel < level; currentLevel += 1) {
    duration = ceilDiv(duration * growthBps, 10_000);
  }
  return duration;
}

/** Returns the proposed duration and every applied cap for audit-friendly UIs. */
export function simulateJob({ boosts = [], ...input }) {
  const rawSeconds = rawDurationSeconds(input);
  const appliedReductionBps = reductionBps(boosts, input.version);
  const reducedSeconds = ceilDiv(
    rawSeconds * (10_000 - appliedReductionBps),
    10_000,
  );
  const minimumCappedSeconds = Math.max(MIN_JOB_SECONDS, reducedSeconds);
  return Object.freeze({
    version: input.version ?? SIMULATOR_VERSION,
    buildingClass: input.buildingClass,
    level: input.level,
    curve: input.curve ?? "steady",
    rawSeconds,
    appliedReductionBps,
    durationSeconds: Math.min(MAX_OFFLINE_SECONDS, minimumCappedSeconds),
    durationCapSeconds: MAX_OFFLINE_SECONDS,
  });
}

/**
 * Sequential, single-slot build hypothesis. It deliberately models no stored
 * resources, unlock prerequisites, combat, or live contract state.
 */
export function levelsCompletedBy({
  buildingClass,
  curve,
  horizonSeconds,
  version = SIMULATOR_VERSION,
}) {
  requireInteger(horizonSeconds, "horizon_seconds");
  let spent = 0;
  let completedLevels = 0;
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const duration = simulateJob({
      buildingClass,
      curve,
      level,
      version,
    }).durationSeconds;
    if (spent + duration > horizonSeconds) break;
    spent += duration;
    completedLevels = level;
  }
  return Object.freeze({ completedLevels, spentSeconds: spent });
}

export function compareCurves({
  buildingClass,
  version = SIMULATOR_VERSION,
  horizons = [1, 7, 30],
}) {
  return horizons.map((days) => {
    requireInteger(days, "days");
    const horizonSeconds = days * 24 * 60 * 60;
    return Object.freeze({
      days,
      steady: levelsCompletedBy({
        buildingClass,
        curve: "steady",
        horizonSeconds,
        version,
      }),
      accelerated: levelsCompletedBy({
        buildingClass,
        curve: "accelerated",
        horizonSeconds,
        version,
      }),
    });
  });
}
