import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRaidEligibility,
  RAID_ELIGIBILITY_AUTHORITY,
  RAID_ELIGIBILITY_POLICY_VERSION,
} from "../server/raid-eligibility-policy.js";

const nowMs = 1_800_000_000_000;
const policy = {
  version: RAID_ELIGIBILITY_POLICY_VERSION,
  newPlayerProtectionMs: 86_400_000,
  repeatRaidCooldownMs: 3_600_000,
  historyWindowMs: 86_400_000,
  reciprocalPairRaidLimit: 3,
  strength: {
    minimumAttackerStrength: 10,
    maximumAttackerToTargetRatioBps: 15_000,
  },
  smallPopulationFallback: {
    maximumEligibleTargetCount: 2,
    relaxStrengthEligibility: true,
  },
};

const attacker = {
  id: "participant-a",
  available: true,
  createdAtMs: 0,
  strength: 100,
};
const target = {
  id: "participant-b",
  available: true,
  createdAtMs: 0,
  strength: 100,
};

function evaluate(overrides = {}) {
  return evaluateRaidEligibility({
    policy,
    nowMs,
    attacker,
    target,
    history: [],
    population: { eligibleTargetCount: 10 },
    ...overrides,
  });
}

function historyEvent(overrides = {}) {
  return {
    eventId: "raid-event-1",
    finalized: true,
    attackerId: "participant-a",
    targetId: "participant-b",
    occurredAtMs: nowMs - 1,
    ...overrides,
  };
}

test("#49 active, available peers with no adverse history are eligible deterministically", () => {
  const first = evaluate();
  assert.deepEqual(first, evaluate());
  assert.equal(first.policyVersion, "49.2");
  assert.equal(first.eligible, true);
  assert.equal("denialCode" in first, false);
  assert.equal(first.authority, RAID_ELIGIBILITY_AUTHORITY);
  assert.equal(Object.isFrozen(first), true);
});

test("#49 protects new targets and rejects unavailable participants", () => {
  assert.equal(
    evaluate({ target: { ...target, createdAtMs: nowMs - 1 } }).eligible,
    false,
  );
  assert.equal(
    evaluate({
      attacker: { ...attacker, available: false },
      target: { ...target, available: false },
    }).eligible,
    false,
  );
});

test("#49 applies explicit strength and directed repeat-raid eligibility", () => {
  assert.equal(
    evaluate({ attacker: { ...attacker, strength: 200 } }).eligible,
    false,
  );
  assert.equal(
    evaluate({
      history: [historyEvent()],
    }).eligible,
    false,
  );
});

test("#49 requires finalized prior raids in both directions for reciprocal restriction", () => {
  const oneWayResult = evaluate({
    history: [
      historyEvent({ occurredAtMs: nowMs - 7_200_000 }),
      historyEvent({
        eventId: "raid-event-2",
        occurredAtMs: nowMs - 10_800_000,
      }),
      historyEvent({
        eventId: "raid-event-3",
        occurredAtMs: nowMs - 14_400_000,
      }),
    ],
  });
  assert.equal(oneWayResult.eligible, true);

  const result = evaluate({
    history: [
      historyEvent({ occurredAtMs: nowMs - 7_200_000 }),
      historyEvent({
        eventId: "raid-event-2",
        attackerId: "participant-b",
        targetId: "participant-a",
        occurredAtMs: nowMs - 10_800_000,
      }),
      historyEvent({
        eventId: "raid-event-3",
        attackerId: "participant-b",
        targetId: "participant-a",
        occurredAtMs: nowMs - 14_400_000,
      }),
    ],
  });
  assert.equal(result.eligible, false);
  assert.equal(result.denialCode, "ineligible");
  assert.equal(JSON.stringify(result).includes("participant-a"), false);
});

test("#49 small-population fallback is explicit and relaxes only strength eligibility", () => {
  const result = evaluate({
    attacker: { ...attacker, strength: 200 },
    population: { eligibleTargetCount: 2 },
  });
  assert.equal(result.eligible, true);
  assert.equal(
    evaluate({
      attacker: { ...attacker, strength: 200 },
      target: { ...target, createdAtMs: nowMs - 1 },
      population: { eligibleTargetCount: 2 },
    }).eligible,
    false,
  );
});

test("#49 applies exact new-player and strength-ratio boundaries", () => {
  assert.equal(
    evaluate({
      target: {
        ...target,
        createdAtMs: nowMs - policy.newPlayerProtectionMs,
      },
    }).eligible,
    true,
  );
  assert.equal(
    evaluate({ attacker: { ...attacker, strength: 150 } }).eligible,
    true,
  );
  assert.equal(
    evaluate({ attacker: { ...attacker, strength: 151 } }).eligible,
    false,
  );
});

test("#49 expires cooldown at the exact boundary and includes history-window boundary", () => {
  assert.equal(
    evaluate({
      history: [
        historyEvent({
          occurredAtMs: nowMs - policy.repeatRaidCooldownMs,
        }),
      ],
    }).eligible,
    true,
  );
  assert.equal(
    evaluate({
      history: [historyEvent()],
    }).eligible,
    false,
  );
  assert.equal(
    evaluate({
      policy: { ...policy, reciprocalPairRaidLimit: 2 },
      history: [
        historyEvent({
          occurredAtMs: nowMs - policy.historyWindowMs,
        }),
        historyEvent({
          eventId: "reverse-event",
          attackerId: "participant-b",
          targetId: "participant-a",
          occurredAtMs: nowMs - policy.historyWindowMs,
        }),
      ],
    }).eligible,
    false,
  );
});

test("#49 emits no public eligibility detail", () => {
  const result = evaluate({
    attacker: {
      ...attacker,
      id: "participant-b",
      available: false,
      strength: 200,
    },
    target: {
      ...target,
      id: "participant-b",
      available: false,
      createdAtMs: nowMs - 1,
    },
    policy: { ...policy, reciprocalPairRaidLimit: 1 },
    history: [
      historyEvent({
        attackerId: "participant-b",
        targetId: "participant-b",
      }),
    ],
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(Object.keys(result), [
    "policyVersion",
    "eligible",
    "denialCode",
    "authority",
  ]);
  assert.equal(result.denialCode, "ineligible");
  assert.equal(
    /available|protected|strength|cooldown|reciprocal|fallback|population/.test(
      JSON.stringify(result),
    ),
    false,
  );
});

test("#49 returns a minimal non-authorizing public result", () => {
  const result = evaluate({
    attacker: { ...attacker, strength: 200 },
    population: { eligibleTargetCount: 2 },
  });
  assert.deepEqual(Object.keys(result), [
    "policyVersion",
    "eligible",
    "authority",
  ]);
  assert.equal(result.authority, "preactivation_non_authorizing");
  assert.equal(JSON.stringify(result).includes("smallPopulation"), false);
  assert.equal(JSON.stringify(result).includes("participant-a"), false);
  assert.equal(JSON.stringify(result).includes("checks"), false);
  assert.equal(JSON.stringify(result).includes("reason"), false);
});

test("#49 fails malformed or temporally inconsistent supplied facts closed", () => {
  assert.throws(() => evaluate({ population: {} }), /eligible_target_count/);
  assert.throws(
    () =>
      evaluate({
        history: [
          {
            eventId: "future-event",
            finalized: true,
            attackerId: "participant-a",
            targetId: "participant-b",
            occurredAtMs: nowMs + 1,
          },
        ],
      }),
    /history_occurred_at_ms/,
  );
  assert.throws(
    () => evaluate({ target: { ...target, createdAtMs: nowMs + 1 } }),
    /target_created_at_ms/,
  );
  assert.throws(
    () =>
      evaluate({
        policy: { ...policy, historyWindowMs: policy.repeatRaidCooldownMs - 1 },
      }),
    /history_window_before_repeat_raid_cooldown/,
  );
  assert.throws(
    () => evaluate({ history: [historyEvent(), historyEvent()] }),
    /duplicate_history_event_id/,
  );
  assert.throws(
    () => evaluate({ history: [historyEvent({ eventId: "" })] }),
    /history_event_id/,
  );
  assert.throws(
    () => evaluate({ history: [historyEvent({ finalized: false })] }),
    /history_finalized/,
  );
});
