export const RESOURCE_DEFS = {
  wood: { label: "Holz", short: "HOLZ", icon: "H", color: "wood" },
  clay: { label: "Lehm", short: "LEHM", icon: "L", color: "clay" },
  stone: { label: "Stein", short: "STEIN", icon: "S", color: "stone" },
  gold: { label: "Gold", short: "GOLD", icon: "G", color: "gold" },
};

// Wood, clay, and stone remain internal game resources. Only gold is the
// CivilizationGame ERC-20. Browser demo remains walletless and never mints it.
export const TOKEN_REGISTRY = {
  wood: { name: "Holz", symbol: "HOLZ", scope: "in-game", externalSettlement: false },
  clay: { name: "Lehm", symbol: "LEHM", scope: "in-game", externalSettlement: false },
  stone: { name: "Stein", symbol: "STEIN", scope: "in-game", externalSettlement: false },
  gold: { name: "Civilization Gold", symbol: "CGOLD", scope: "on-chain", externalSettlement: true, pairs: [] },
};

const INTERNAL_VALUES = { wood: 1, clay: 1.1, stone: 1.25 };
export const COLLECTION_COOLDOWN_MS = 60_000;
export const MARCH_DURATION_MS = 60_000;

const cost = (wood = 0, clay = 0, stone = 0, gold = 0) => ({ wood, clay, stone, gold });

export const BUILDINGS = {
  townhall: {
    label: "Rathaus", icon: "R", detail: "Schaltet stärkere Ausbauten frei.", base: cost(55, 65, 75, 0), factor: 1.58,
    requires: (level) => {
      if (level === 1) return [];
      const requirements = ["timber", "claypit", "quarry"].map((id) => ({ id, level }));
      if (level >= 3) requirements.push({ id: "warehouse", level: level - 1 });
      if (level >= 5) requirements.push({ id: "workshop", level: level - 3 });
      return requirements;
    },
  },
  timber: { label: "Holzfäller", icon: "H", detail: "Erzeugt Holz.", base: cost(35, 20, 15), factor: 1.46, produces: { wood: 0.55 } },
  claypit: { label: "Lehmgrube", icon: "L", detail: "Erzeugt Lehm.", base: cost(25, 40, 20), factor: 1.47, produces: { clay: 0.5 } },
  quarry: { label: "Steinbruch", icon: "S", detail: "Erzeugt Stein.", base: cost(30, 25, 45), factor: 1.48, produces: { stone: 0.46 } },
  warehouse: {
    label: "Speicher", icon: "SP", detail: "Erhöht Kapazität aller Rohstoffe.", base: cost(45, 45, 35), factor: 1.52,
    requires: () => [{ id: "townhall", level: 1 }],
  },
  workshop: {
    label: "Werkstatt", icon: "W", detail: "Voraussetzung für Gold und Einheiten.", base: cost(90, 110, 105, 15), factor: 1.6,
    requires: () => [{ id: "townhall", level: 2 }, { id: "timber", level: 2 }, { id: "claypit", level: 2 }, { id: "quarry", level: 2 }],
  },
  goldmine: {
    label: "Goldschacht", icon: "G", detail: "Erzeugt Gold für Ausbildung.", base: cost(130, 120, 150, 0), factor: 1.66, produces: { gold: 0.13 },
    requires: () => [{ id: "townhall", level: 4 }, { id: "workshop", level: 2 }],
  },
  barracks: {
    label: "Kaserne", icon: "K", detail: "Bildet Truppen aus.", base: cost(125, 145, 105, 25), factor: 1.62,
    requires: () => [{ id: "townhall", level: 3 }, { id: "workshop", level: 1 }],
  },
};

export const TROOPS = {
  spear: { label: "Speerträger", icon: "SP", attack: 10, cost: cost(22, 16, 8, 1), requires: [{ id: "barracks", level: 1 }] },
  archer: { label: "Bogenschütze", icon: "B", attack: 17, cost: cost(30, 22, 12, 2), requires: [{ id: "barracks", level: 2 }, { id: "workshop", level: 1 }] },
  rider: { label: "Reiter", icon: "R", attack: 31, cost: cost(45, 35, 24, 4), requires: [{ id: "barracks", level: 3 }, { id: "workshop", level: 2 }] },
};

const target = (id, name, defense, unclaimed) => ({ id, name, defense, unclaimed, initialUnclaimed: unclaimed });
export const DEMO_TARGETS = [
  target("river", "Flusswacht", 54, cost(135, 85, 70, 12)),
  target("ash", "Aschenhain", 128, cost(245, 210, 160, 28)),
  target("iron", "Eisenwacht", 245, cost(410, 340, 320, 55)),
];

export function createInitialState(now = Date.now()) {
  return {
    // Leaves demo gold available for the first spear after workshop and
    // barracks are paid for. Demo state never represents an ERC-20 balance.
    resources: cost(240, 220, 210, 45),
    // Produced resources stay exposed in the field until the player collects them.
    // Only `resources` is spendable; `unclaimed` is the raidable field stock.
    unclaimed: cost(),
    buildings: { townhall: 1, timber: 1, claypit: 1, quarry: 1, warehouse: 1, workshop: 0, goldmine: 0, barracks: 0 },
    troops: { spear: 0, archer: 0, rider: 0 },
    targets: DEMO_TARGETS.map((item) => ({ ...item, unclaimed: { ...item.unclaimed }, initialUnclaimed: { ...item.initialUnclaimed } })),
    raids: 0,
    lastRaid: null,
    gatherAvailableAt: 0,
    pendingRaid: null,
    last: now,
  };
}

export function format(value) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: value < 100 ? 1 : 0 }).format(value);
}

export function getCapacity(state) {
  return Math.round(500 * 1.7 ** Math.max(0, state.buildings.warehouse - 1));
}

export function getProduction(state) {
  const production = cost();
  Object.entries(BUILDINGS).forEach(([id, building]) => {
    if (!building.produces) return;
    Object.entries(building.produces).forEach(([resource, rate]) => { production[resource] += rate * state.buildings[id]; });
  });
  return production;
}

export function settle(state, now = Date.now()) {
  const elapsed = Math.min(8 * 60 * 60, Math.max(0, (now - state.last) / 1000));
  const production = getProduction(state);
  const capacity = getCapacity(state);
  state.unclaimed ||= cost();
  Object.keys(RESOURCE_DEFS).forEach((resource) => {
    state.unclaimed[resource] = Math.min(capacity, state.unclaimed[resource] + production[resource] * elapsed);
  });
  state.last = now;
  return state;
}

export function getBuildingCost(state, id) {
  const building = BUILDINGS[id];
  const exponent = state.buildings[id] || 0;
  return Object.fromEntries(Object.entries(building.base).map(([resource, value]) => [resource, Math.ceil(value * building.factor ** exponent)]));
}

export function getRequirements(state, id) {
  const building = BUILDINGS[id];
  return (building.requires?.((state.buildings[id] || 0) + 1) || []).filter(({ id: required, level }) => (state.buildings[required] || 0) < level);
}

export function canPay(resources, required) {
  return Object.keys(RESOURCE_DEFS).every((resource) => resources[resource] >= required[resource]);
}

export function pay(resources, required) {
  Object.keys(RESOURCE_DEFS).forEach((resource) => { resources[resource] -= required[resource]; });
}

export function upgradeBuilding(state, id, now = Date.now()) {
  settle(state, now);
  const missingRequirements = getRequirements(state, id);
  const required = getBuildingCost(state, id);
  if (missingRequirements.length) return { ok: false, reason: "requirements", missingRequirements };
  if (!canPay(state.resources, required)) return { ok: false, reason: "resources", required };
  pay(state.resources, required);
  state.buildings[id] += 1;
  return { ok: true, required };
}

export function gather(state, now = Date.now()) {
  settle(state, now);
  const capacity = getCapacity(state);
  const collected = cost();
  Object.keys(RESOURCE_DEFS).forEach((resource) => {
    collected[resource] = Math.min(state.unclaimed[resource], Math.max(0, capacity - state.resources[resource]));
    state.resources[resource] += collected[resource];
    state.unclaimed[resource] -= collected[resource];
  });
  return { collected, unclaimed: state.unclaimed };
}

export function startGathering(state, now = Date.now()) {
  if (now < (state.gatherAvailableAt || 0)) return { ok: false, reason: "cooldown" };
  const result = gather(state, now);
  state.gatherAvailableAt = now + COLLECTION_COOLDOWN_MS;
  return { ok: true, ...result, availableAt: state.gatherAvailableAt };
}

export function swapInternal(state, from, to, amount, now = Date.now()) {
  settle(state, now);
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (!INTERNAL_VALUES[from] || !INTERNAL_VALUES[to] || from === to || !safeAmount) return { ok: false, reason: "market" };
  if (state.resources[from] < safeAmount) return { ok: false, reason: "resources" };
  const output = Math.floor((safeAmount * INTERNAL_VALUES[from]) / INTERNAL_VALUES[to]);
  const received = Math.min(output, Math.max(0, getCapacity(state) - state.resources[to]));
  if (!received) return { ok: false, reason: "capacity" };
  state.resources[from] -= safeAmount;
  state.resources[to] += received;
  return { ok: true, output: received };
}

export function trainTroop(state, id, amount = 1, now = Date.now()) {
  settle(state, now);
  const troop = TROOPS[id];
  const safeAmount = Math.max(1, Math.floor(Number(amount) || 1));
  const missingRequirements = troop.requires.filter(({ id: required, level }) => state.buildings[required] < level);
  const required = Object.fromEntries(Object.entries(troop.cost).map(([resource, value]) => [resource, value * safeAmount]));
  if (missingRequirements.length) return { ok: false, reason: "requirements", missingRequirements };
  if (!canPay(state.resources, required)) return { ok: false, reason: "resources", required };
  pay(state.resources, required);
  state.troops[id] += safeAmount;
  return { ok: true, required, amount: safeAmount };
}

function loot(targetLoot, capacity) {
  const total = Object.values(targetLoot).reduce((sum, amount) => sum + amount, 0);
  if (!total || !capacity) return cost();
  const result = cost();
  Object.keys(RESOURCE_DEFS).forEach((resource) => {
    result[resource] = Math.min(targetLoot[resource], Math.floor((targetLoot[resource] / total) * capacity));
  });
  return result;
}

export function sendRaid(state, targetId, selected, now = Date.now()) {
  settle(state, now);
  const target = state.targets.find((item) => item.id === targetId);
  const army = Object.fromEntries(Object.keys(TROOPS).map((id) => [id, Math.max(0, Math.floor(Number(selected[id]) || 0))]));
  const total = Object.values(army).reduce((sum, value) => sum + value, 0);
  if (!target || !total) return { ok: false, reason: "army" };
  if (Object.keys(army).some((id) => army[id] > state.troops[id])) return { ok: false, reason: "availability" };
  const attack = Object.entries(army).reduce((sum, [id, amount]) => sum + TROOPS[id].attack * amount, 0);
  const won = attack >= target.defense;
  const casualtyRate = won ? 0.08 : 0.38;
  const casualties = Object.fromEntries(Object.keys(TROOPS).map((id) => [id, Math.min(army[id], Math.ceil(army[id] * casualtyRate))]));
  Object.keys(TROOPS).forEach((id) => { state.troops[id] -= casualties[id]; });
  // Accept legacy demo saves, which used `loot` before field stock existed.
  target.unclaimed ||= { ...(target.loot || cost()) };
  const stolen = won ? loot(target.unclaimed, total * 18) : cost();
  Object.keys(RESOURCE_DEFS).forEach((resource) => {
    target.unclaimed[resource] -= stolen[resource];
    state.resources[resource] = Math.min(getCapacity(state), state.resources[resource] + stolen[resource]);
  });
  state.raids += 1;
  state.lastRaid = { ok: won, target: target.name, stolen, casualties, attack, defense: target.defense };
  return { ok: true, ...state.lastRaid };
}

export function startRaidMarch(state, targetId, selected, now = Date.now()) {
  settle(state, now);
  if (state.pendingRaid) return { ok: false, reason: "march" };
  const target = state.targets.find((item) => item.id === targetId);
  const army = Object.fromEntries(Object.keys(TROOPS).map((id) => [id, Math.max(0, Math.floor(Number(selected[id]) || 0))]));
  const total = Object.values(army).reduce((sum, value) => sum + value, 0);
  if (!target || !total) return { ok: false, reason: "army" };
  if (Object.keys(army).some((id) => army[id] > state.troops[id])) return { ok: false, reason: "availability" };
  state.pendingRaid = { targetId, army, arrivesAt: now + MARCH_DURATION_MS };
  return { ok: true, ...state.pendingRaid };
}

export function resolveRaidMarch(state, now = Date.now()) {
  if (!state.pendingRaid || now < state.pendingRaid.arrivesAt) return { ok: false, reason: "march" };
  const { targetId, army } = state.pendingRaid;
  state.pendingRaid = null;
  return sendRaid(state, targetId, army, now);
}
