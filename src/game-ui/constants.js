const asset = (path) =>
  `${(globalThis.window?.__CIVILIZATION_ASSET_BASE__ || "").replace(/\/$/, "")}/assets/${path}`;

export const STORAGE_KEY = "civilization-village-demo-v1";
export const MAX_BUILDING_LEVEL = 30;
export const BUILDING_IDS = [
  "townhall",
  "timber",
  "claypit",
  "quarry",
  "warehouse",
  "workshop",
  "goldmine",
  "barracks",
];
export const BUILDING_ASSETS = Object.fromEntries(
  [...BUILDING_IDS, "market"].map((id) => [
    id,
    asset(`village-v2/buildings/${id}.png`),
  ]),
);
export const RESOURCE_ASSETS = Object.fromEntries(
  ["wood", "clay", "stone", "gold"].map((id) => [
    id,
    asset(`village-v2/resources/${id}.png`),
  ]),
);
export const TROOP_ASSETS = {
  spear: asset("units/spearman.png"),
  archer: asset("units/archer.png"),
  rider: asset("units/knight.png"),
};
export const CITY_MAPS = {
  desktop: asset("maps/mintia-village-map-v1.png"),
  mobile: asset("maps/mintia-village-map-mobile-v2.png"),
};
