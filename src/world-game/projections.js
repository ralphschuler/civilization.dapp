import {
  BASIS_POINTS,
  FRACTION_SCALE,
  MAX_OFFLINE_SECONDS,
  PRESTIGE_BONUS_BPS,
  RESOURCE_BASE_DAILY_RATE,
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
  return Object.fromEntries(
    ["wood", "clay", "stone", "gold"].map((resource, index) => [
      resource,
      values[index],
    ]),
  );
}

export function getContractRequirements(state, id) {
  const buildings = state.buildings;
  const next = (buildings[id] || 0) + 1;
  const required = [];
  const add = (building, level) => {
    if ((buildings[building] || 0) < level) {
      required.push({ id: building, level });
    }
  };
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
