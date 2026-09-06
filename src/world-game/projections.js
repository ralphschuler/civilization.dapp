import {
  BASIS_POINTS,
  FRACTION_SCALE,
  MAX_OFFLINE_SECONDS,
  PRESTIGE_BONUS_BPS,
  RESOURCE_BASE_DAILY_RATE,
  BUILDING_IDS,
  TROOP_IDS,
  monotonicNow,
} from "./constants.js";

const buildingForResource = {
  wood: "timber",
  clay: "claypit",
  stone: "quarry",
  gold: "goldmine",
};

const baseCosts = Object.freeze({
  townhall: { values: [280, 260, 240, 0], factor: 160 },
  timber: { values: [35, 20, 15, 0], factor: 146 },
  claypit: { values: [25, 40, 20, 0], factor: 147 },
  quarry: { values: [30, 25, 45, 0], factor: 148 },
  warehouse: { values: [45, 45, 35, 0], factor: 152 },
  workshop: { values: [90, 110, 105, 15], factor: 160 },
  goldmine: { values: [130, 120, 150, 0], factor: 166 },
  barracks: { values: [125, 145, 105, 25], factor: 162 },
});

export function getContractBuildingCost(state, id) {
  const definition = baseCosts[id];
  if (!definition) {
    throw new Error("invalid_building");
  }
  const values = [...definition.values];
  for (let level = 0; level < (state.buildings[id] || 0); level += 1) {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.ceil((values[index] * definition.factor) / 100);
    }
  }
  // Matches on-chain prerequisite rule: Workshop I and II waive CGOLD.
  if (id === "workshop" && (state.buildings[id] || 0) <= 1) {
    values[3] = 0;
  }
  return Object.fromEntries(
    ["wood", "clay", "stone", "gold"].map((resource, index) => [
      resource,
      values[index],
    ]),
  );
}

export function getContractRequirementsForLevel(id, next) {
  const required = [];
  const add = (building, level) => required.push({ id: building, level });
  if (id === "townhall") {
    add("timber", next);
    add("claypit", next);
    add("quarry", next);
    if (next >= 3) {
      add("warehouse", next - 1);
    }
    if (next >= 5) {
      add("workshop", next - 3);
    }
  } else if (id === "warehouse") {
    add("townhall", 1);
  } else if (id === "workshop") {
    add("townhall", 2);
    add("timber", 2);
    add("claypit", 2);
    add("quarry", 2);
  } else if (id === "goldmine") {
    add("townhall", 4);
    add("workshop", 2);
  } else if (id === "barracks") {
    add("townhall", 3);
    add("workshop", 1);
  }
  return required;
}

export function getContractRequirements(state, id) {
  const buildings = state.buildings;
  const next = (buildings[id] || 0) + 1;
  return getContractRequirementsForLevel(id, next).filter(
    ({ id: required, level }) => (buildings[required] || 0) < level,
  );
}

export function getContractTroopRequirements(state, id) {
  const levels = { spear: 1, archer: 2, rider: 3 };
  const required = [];
  if (state.buildings.barracks < (levels[id] || 99)) {
    required.push({ id: "barracks", level: levels[id] || 99 });
  }
  if (id === "rider" && state.buildings.workshop < 2) {
    required.push({ id: "workshop", level: 2 });
  }
  return required;
}

export function getContractCapacity(state) {
  let capacity = 500;
  for (let level = 1; level < (state.buildings.warehouse || 0); level += 1) {
    capacity = Math.floor((capacity * 17 + 5) / 10);
  }
  return capacity;
}

export function getContractProduction(state) {
  const multiplier = 1 + (state.prestigeCount || 0) * 0.1;
  return Object.fromEntries(
    Object.entries(RESOURCE_BASE_DAILY_RATE).map(([resource, dailyRate]) => [
      resource,
      dailyRate * state.buildings[buildingForResource[resource]] * multiplier,
    ]),
  );
}

// Keep these display projections beside the matching read-side rules above.
// They never make a contract call and must not be used as transaction
// preflight: the contract remains the authority at execution time.
export function getContractConstructionCapacity(state) {
  const workshop = state.buildings?.workshop || 0;
  if (workshop >= 21) return 3;
  if (workshop >= 11) return 2;
  return 1;
}

export function getContractDefense(state) {
  const troops = state.troops || {};
  const troopPower =
    (troops.spear || 0) * 10 +
    (troops.archer || 0) * 17 +
    (troops.rider || 0) * 31;
  return Math.max(
    1,
    Math.floor((troopPower * 65) / 100) + (state.buildings?.townhall || 0) * 20,
  );
}

function nextBuildingState(state, id) {
  return {
    ...state,
    buildings: { ...state.buildings, [id]: (state.buildings?.[id] || 0) + 1 },
  };
}

function newlyUnlocked(state, nextState, requirements, ids) {
  return ids.filter(
    (id) =>
      requirements(state, id).length > 0 &&
      requirements(nextState, id).length === 0,
  );
}

/**
 * Read-only before/after upgrade comparison. All numeric rules intentionally
 * reuse the same contract parity projections used by the wallet adapter.
 */
export function projectContractUpgradeImpact(state, id) {
  if (!BUILDING_IDS.includes(id)) throw new Error("invalid_building");
  const level = state.buildings?.[id] || 0;
  if (level >= 30) return { available: false, reason: "max_level" };

  const nextState = nextBuildingState(state, id);
  const productionBefore = getContractProduction(state);
  const productionAfter = getContractProduction(nextState);
  const production = Object.entries(productionAfter)
    .filter(([resource, after]) => after !== productionBefore[resource])
    .map(([resource, after]) => ({
      resource,
      before: productionBefore[resource],
      after,
      delta: after - productionBefore[resource],
    }));
  const capacityBefore = getContractCapacity(state);
  const capacityAfter = getContractCapacity(nextState);
  const slotsBefore = getContractConstructionCapacity(state);
  const slotsAfter = getContractConstructionCapacity(nextState);
  const defenseBefore = getContractDefense(state);
  const defenseAfter = getContractDefense(nextState);

  return {
    available: true,
    level,
    production,
    capacity:
      capacityAfter === capacityBefore
        ? null
        : {
            before: capacityBefore,
            after: capacityAfter,
            delta: capacityAfter - capacityBefore,
          },
    constructionSlots:
      slotsAfter === slotsBefore
        ? null
        : {
            before: slotsBefore,
            after: slotsAfter,
            delta: slotsAfter - slotsBefore,
          },
    defense:
      defenseAfter === defenseBefore
        ? null
        : {
            before: defenseBefore,
            after: defenseAfter,
            delta: defenseAfter - defenseBefore,
          },
    unlocks: {
      buildings: newlyUnlocked(
        state,
        nextState,
        getContractRequirements,
        BUILDING_IDS,
      ),
      troops: newlyUnlocked(
        state,
        nextState,
        getContractTroopRequirements,
        TROOP_IDS,
      ),
    },
  };
}

/**
 * Produces a display-only projection from an authoritative chain snapshot.
 * Repeated frames always use the same anchor and never mutate the snapshot.
 */
export function projectCivilizationState(
  snapshot,
  performanceNow = monotonicNow(),
) {
  if (!snapshot?.registered || !Number.isFinite(snapshot.last)) {
    return snapshot;
  }
  const elapsedMs = Math.max(
    0,
    performanceNow - (snapshot.performanceAnchor ?? performanceNow),
  );
  const elapsed = Math.min(MAX_OFFLINE_SECONDS, Math.floor(elapsedMs / 1000));
  const capacity = getContractCapacity(snapshot);
  const multiplierBps =
    BASIS_POINTS + (snapshot.prestigeCount || 0) * PRESTIGE_BONUS_BPS;
  const unclaimed = Object.fromEntries(
    Object.keys(RESOURCE_BASE_DAILY_RATE).map((resource) => {
      const building = buildingForResource[resource];
      const rate =
        RESOURCE_BASE_DAILY_RATE[resource] *
        (snapshot.buildings?.[building] || 0) *
        multiplierBps;
      if (snapshot.accrual?.fractionScale) {
        const whole = snapshot.accrual.wholeField?.[resource] || 0;
        const remainder = snapshot.accrual.fractionalRemainder?.[resource] || 0;
        return [
          resource,
          Math.min(
            capacity,
            whole +
              (remainder + elapsed * rate) / snapshot.accrual.fractionScale,
          ),
        ];
      }
      return [
        resource,
        Math.min(
          capacity,
          (snapshot.unclaimed?.[resource] || 0) +
            Math.floor((elapsed * rate) / FRACTION_SCALE),
        ),
      ];
    }),
  );
  return { ...snapshot, unclaimed };
}

export function claimEligibility(state) {
  if (!state?.registered || !Number.isFinite(state.chainTimestamp)) {
    return false;
  }
  if (state.chainTimestamp < (state.gatherAvailableAt || 0)) {
    return false;
  }
  const capacity = getContractCapacity(state);
  const transferable = ["wood", "clay", "stone"].some(
    (resource) =>
      Math.min(
        state.unclaimed?.[resource] || 0,
        Math.max(0, capacity - (state.resources?.[resource] || 0)),
      ) >= 1,
  );
  return transferable || (state.unclaimed?.gold || 0) >= 1;
}
