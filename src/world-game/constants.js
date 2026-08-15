export const CIVILIZATION_GAME_ADDRESS =
  "0x0E6689d0649Ad9037465d178231b10F18518D2b0";
export const WORLD_TOKEN_ADDRESS = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003";

export const BUILDING_INDEX = Object.freeze({
  townhall: 0,
  timber: 1,
  claypit: 2,
  quarry: 3,
  warehouse: 4,
  workshop: 5,
  goldmine: 6,
  barracks: 7,
});
export const TROOP_INDEX = Object.freeze({ spear: 0, archer: 1, rider: 2 });
export const BUILDING_IDS = Object.freeze(Object.keys(BUILDING_INDEX));
export const TROOP_IDS = Object.freeze(Object.keys(TROOP_INDEX));

export const WORLD_TOKEN_UNIT = 10n ** 18n;
export const BASIS_POINTS = 10_000;
export const PRESTIGE_BONUS_BPS = 1_000;
export const FRACTION_SCALE = 86_400 * BASIS_POINTS;
export const MAX_OFFLINE_SECONDS = 86_400;
export const RESOURCE_BASE_DAILY_RATE = Object.freeze({
  wood: 300,
  clay: 270,
  stone: 240,
  gold: 12,
});

export const monotonicNow = () => globalThis.performance?.now?.() ?? 0;
