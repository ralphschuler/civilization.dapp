import { createInitialState } from "../game.js";
import { STORAGE_KEY } from "../game-ui/constants.js";

function migrateTarget(target, initialState) {
  const legacyUnclaimed = target.unclaimed || target.loot || {};
  const legacyInitialUnclaimed =
    target.initialUnclaimed || target.initialLoot || legacyUnclaimed;

  return {
    ...target,
    unclaimed: { ...initialState.unclaimed, ...legacyUnclaimed },
    initialUnclaimed: {
      ...initialState.unclaimed,
      ...legacyInitialUnclaimed,
    },
  };
}

export function loadDemoState(storage = localStorage) {
  const initialState = createInitialState();

  try {
    const savedState = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
    if (
      !savedState?.resources ||
      !savedState?.buildings ||
      !savedState?.troops
    ) {
      return initialState;
    }

    const savedTargets = savedState.targets || initialState.targets;
    const targets = savedTargets.map((target) =>
      migrateTarget(target, initialState),
    );

    return {
      ...initialState,
      ...savedState,
      resources: { ...initialState.resources, ...savedState.resources },
      unclaimed: { ...initialState.unclaimed, ...savedState.unclaimed },
      buildings: { ...initialState.buildings, ...savedState.buildings },
      troops: { ...initialState.troops, ...savedState.troops },
      targets,
    };
  } catch {
    return initialState;
  }
}

export function saveDemoState(state, storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearDemoState(storage = localStorage) {
  storage.removeItem(STORAGE_KEY);
}
