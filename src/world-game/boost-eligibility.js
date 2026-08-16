export const CONSTRUCTION_BOOST_SECONDS = 60 * 60;

/**
 * Mirrors the time-related preconditions of CivilizationGame.boostConstruction.
 * The contract remains authoritative; this is used to avoid offering or
 * prompting for a transaction that is already known to be invalid.
 */
export function constructionBoostEligibility({
  construction,
  now,
  remainingSeconds: suppliedRemainingSeconds,
  busy = false,
}) {
  if (busy) return { eligible: false, reason: "transaction_pending" };
  if (!construction?.pending) {
    return { eligible: false, reason: "no_boostable_construction" };
  }
  if (
    !Number.isFinite(construction.completesAt) ||
    (!Number.isFinite(suppliedRemainingSeconds) && !Number.isFinite(now))
  ) {
    return { eligible: false, reason: "construction_time_unavailable" };
  }

  const remainingSeconds = Math.max(
    0,
    Number.isFinite(suppliedRemainingSeconds)
      ? Math.ceil(suppliedRemainingSeconds)
      : Math.ceil((construction.completesAt - now) / 1_000),
  );
  if (remainingSeconds === 0) {
    return {
      eligible: false,
      reason: "construction_complete",
      remainingSeconds,
    };
  }
  // Solidity rejects only durations greater than the remaining time. An exact
  // one-hour remainder is therefore a valid one-hour boost.
  if (remainingSeconds < CONSTRUCTION_BOOST_SECONDS) {
    return { eligible: false, reason: "less_than_one_hour", remainingSeconds };
  }
  return { eligible: true, reason: null, remainingSeconds };
}
