/**
 * Issue #49 policy seam. This is deliberately a pure server-compatible
 * evaluator: it selects no targets, reads no wallet or chain data, and has no
 * persistence or transaction side effects. A caller must supply a reviewed
 * policy and a single, captured set of facts.
 */
export const RAID_ELIGIBILITY_POLICY_VERSION = "49.2";

// This slice is deliberately unable to authorize a raid. It becomes relevant
// only after a trusted server path and contract/transaction enforcement exist.
export const RAID_ELIGIBILITY_AUTHORITY = "preactivation_non_authorizing";

const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

function invalid(name) {
  throw new Error(`invalid_raid_eligibility:${name}`);
}

function integer(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) invalid(name);
  return value;
}

function participant(value, name) {
  if (!value || typeof value !== "object") invalid(name);
  if (typeof value.id !== "string" || value.id.length === 0)
    invalid(`${name}_id`);
  if (typeof value.available !== "boolean") invalid(`${name}_available`);
  const normalized = {
    id: value.id,
    available: value.available,
    createdAtMs: integer(value.createdAtMs, `${name}_created_at_ms`),
    strength: integer(value.strength, `${name}_strength`),
  };
  return normalized;
}

function policy(value) {
  if (!value || typeof value !== "object") invalid("policy");
  if (typeof value.version !== "string" || value.version.length === 0)
    invalid("policy_version");
  const strength = value.strength;
  const fallback = value.smallPopulationFallback;
  if (!strength || typeof strength !== "object") invalid("strength_policy");
  if (!fallback || typeof fallback !== "object")
    invalid("small_population_fallback");
  if (typeof fallback.relaxStrengthEligibility !== "boolean")
    invalid("small_population_relax_strength_eligibility");
  const normalized = {
    version: value.version,
    newPlayerProtectionMs: integer(
      value.newPlayerProtectionMs,
      "new_player_protection_ms",
    ),
    repeatRaidCooldownMs: integer(
      value.repeatRaidCooldownMs,
      "repeat_raid_cooldown_ms",
    ),
    historyWindowMs: integer(value.historyWindowMs, "history_window_ms"),
    reciprocalPairRaidLimit: integer(
      value.reciprocalPairRaidLimit,
      "reciprocal_pair_raid_limit",
      1,
    ),
    strength: {
      minimumAttackerStrength: integer(
        strength.minimumAttackerStrength,
        "minimum_attacker_strength",
      ),
      maximumAttackerToTargetRatioBps: integer(
        strength.maximumAttackerToTargetRatioBps,
        "maximum_attacker_to_target_ratio_bps",
      ),
    },
    smallPopulationFallback: {
      maximumEligibleTargetCount: integer(
        fallback.maximumEligibleTargetCount,
        "small_population_maximum_eligible_target_count",
      ),
      relaxStrengthEligibility: fallback.relaxStrengthEligibility,
    },
  };
  if (normalized.historyWindowMs < normalized.repeatRaidCooldownMs)
    invalid("history_window_before_repeat_raid_cooldown");
  return normalized;
}

function historyEvent(value, nowMs) {
  if (!value || typeof value !== "object") invalid("history_event");
  if (typeof value.eventId !== "string" || value.eventId.length === 0)
    invalid("history_event_id");
  if (value.finalized !== true) invalid("history_finalized");
  if (typeof value.attackerId !== "string" || value.attackerId.length === 0)
    invalid("history_attacker_id");
  if (typeof value.targetId !== "string" || value.targetId.length === 0)
    invalid("history_target_id");
  const occurredAtMs = integer(value.occurredAtMs, "history_occurred_at_ms");
  if (occurredAtMs > nowMs) invalid("history_occurred_at_ms");
  return {
    eventId: value.eventId,
    attackerId: value.attackerId,
    targetId: value.targetId,
    occurredAtMs,
  };
}

/**
 * Evaluates supplied facts deterministically. The returned decision is
 * preactivation and non-authorizing: callers must not use it to authorize a
 * transaction or target discovery. Ineligible decisions have only the stable,
 * generic `ineligible` denial code, which reveals no evaluated condition.
 */
export function evaluateRaidEligibility(input) {
  if (!input || typeof input !== "object") invalid("input");
  const nowMs = integer(input.nowMs, "now_ms");
  const rules = policy(input.policy);
  const attacker = participant(input.attacker, "attacker");
  const target = participant(input.target, "target");
  if (attacker.createdAtMs > nowMs) invalid("attacker_created_at_ms");
  if (target.createdAtMs > nowMs) invalid("target_created_at_ms");
  if (!Array.isArray(input.history)) invalid("history");
  if (!input.population || typeof input.population !== "object")
    invalid("population");
  const eligibleTargetCount = integer(
    input.population.eligibleTargetCount,
    "eligible_target_count",
    1,
  );
  const eventIds = new Set();
  const history = input.history.map((event) => {
    const normalized = historyEvent(event, nowMs);
    if (eventIds.has(normalized.eventId)) invalid("duplicate_history_event_id");
    eventIds.add(normalized.eventId);
    return normalized;
  });
  // The history window deliberately includes its exact lower boundary.
  const inWindow = history.filter(
    (event) => event.occurredAtMs >= nowMs - rules.historyWindowMs,
  );
  const directedRaids = inWindow.filter(
    (event) => event.attackerId === attacker.id && event.targetId === target.id,
  );
  const reverseDirectedRaids = inWindow.filter(
    (event) => event.attackerId === target.id && event.targetId === attacker.id,
  );
  const pairRaids = inWindow.filter(
    (event) =>
      (event.attackerId === attacker.id && event.targetId === target.id) ||
      (event.attackerId === target.id && event.targetId === attacker.id),
  );
  const fallbackApplies =
    rules.smallPopulationFallback.relaxStrengthEligibility &&
    eligibleTargetCount <=
      rules.smallPopulationFallback.maximumEligibleTargetCount;
  const strengthPasses =
    attacker.strength >= rules.strength.minimumAttackerStrength &&
    BigInt(attacker.strength) * 10_000n <=
      BigInt(target.strength) *
        BigInt(rules.strength.maximumAttackerToTargetRatioBps);
  const repeatRaidCooldownApplies = directedRaids.some(
    // A cooldown is expired at exact elapsed duration, so its lower
    // boundary is exclusive.
    (event) => event.occurredAtMs > nowMs - rules.repeatRaidCooldownMs,
  );
  const reciprocalPatternApplies =
    pairRaids.length >= rules.reciprocalPairRaidLimit &&
    directedRaids.length > 0 &&
    reverseDirectedRaids.length > 0;
  const ineligible =
    attacker.id === target.id ||
    !attacker.available ||
    !target.available ||
    nowMs - target.createdAtMs < rules.newPlayerProtectionMs ||
    (!strengthPasses && !fallbackApplies) ||
    repeatRaidCooldownApplies ||
    reciprocalPatternApplies;

  return freeze({
    policyVersion: rules.version,
    eligible: !ineligible,
    ...(ineligible ? { denialCode: "ineligible" } : {}),
    authority: RAID_ELIGIBILITY_AUTHORITY,
  });
}
