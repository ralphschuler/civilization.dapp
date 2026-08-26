export const VILLAGE_APPEARANCES = Object.freeze(["classic", "dusk"]);
export const DEFAULT_VILLAGE_APPEARANCE = "classic";

/** Untrusted DB, network, and UI values always resolve to the safe skin. */
export function resolveVillageAppearance(value) {
  return VILLAGE_APPEARANCES.includes(value)
    ? value
    : DEFAULT_VILLAGE_APPEARANCE;
}

export function isVillageAppearance(value) {
  return VILLAGE_APPEARANCES.includes(value);
}
