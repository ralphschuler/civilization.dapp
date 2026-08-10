import {
  BUILDINGS,
  RESOURCE_DEFS,
  TROOPS,
  createInitialState,
  resolveRaidMarch,
  startGathering,
  startRaidMarch,
  swapInternal,
  trainTroop,
  upgradeBuilding,
} from "../src/game.js";
import { validatePublicVillageId } from "./pvp.js";

export const ANONYMOUS_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
export const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function validateAnonymousId(value) {
  return typeof value === "string" && ANONYMOUS_ID_PATTERN.test(value);
}

export function validateActionId(value) {
  return typeof value === "string" && ACTION_ID_PATTERN.test(value);
}

function integer(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function resource(value) {
  return typeof value === "string" && Object.hasOwn(RESOURCE_DEFS, value);
}

function building(value) {
  return typeof value === "string" && Object.hasOwn(BUILDINGS, value);
}

function troop(value) {
  return typeof value === "string" && Object.hasOwn(TROOPS, value);
}

export function validateAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) return null;
  const payload = action.payload && typeof action.payload === "object" && !Array.isArray(action.payload) ? action.payload : {};
  switch (action.type) {
    case "gather":
    case "resolve_raid":
    case "reset":
      return Object.keys(payload).length === 0 ? { type: action.type, payload } : null;
    case "upgrade":
      return building(payload.building) && Object.keys(payload).length === 1 ? { type: action.type, payload } : null;
    case "train":
      return troop(payload.troop) && integer(payload.amount, { min: 1, max: 100 }) && Object.keys(payload).length === 2 ? { type: action.type, payload } : null;
    case "swap":
      return resource(payload.from) && resource(payload.to) && payload.from !== "gold" && payload.to !== "gold"
        && integer(payload.amount, { min: 1, max: 1_000_000 }) && Object.keys(payload).length === 3 ? { type: action.type, payload } : null;
    case "start_raid": {
      if (!validatePublicVillageId(payload.targetId) || !Array.isArray(payload.army) || payload.army.length !== 3 || Object.keys(payload).length !== 2) return null;
      const expected = Object.keys(TROOPS);
      const army = {};
      for (const item of payload.army) {
        if (!item || typeof item !== "object" || !troop(item.troop) || !integer(item.amount, { min: 0, max: 100_000 }) || Object.keys(item).length !== 2 || Object.hasOwn(army, item.troop)) return null;
        army[item.troop] = item.amount;
      }
      return expected.every((id) => Object.hasOwn(army, id)) ? { type: action.type, payload: { targetId: payload.targetId, army } } : null;
    }
    default:
      return null;
  }
}

export function applyGameAction(state, action, now = Date.now()) {
  switch (action.type) {
    case "gather": return startGathering(state, now);
    case "upgrade": return upgradeBuilding(state, action.payload.building, now);
    case "train": return trainTroop(state, action.payload.troop, action.payload.amount, now);
    case "swap": return swapInternal(state, action.payload.from, action.payload.to, action.payload.amount, now);
    case "start_raid": return startRaidMarch(state, action.payload.targetId, action.payload.army, now);
    case "resolve_raid": return resolveRaidMarch(state, now);
    case "reset": {
      Object.assign(state, createInitialState(now));
      return { ok: true };
    }
    default: throw new Error("invalid_action");
  }
}

// Keeps retry handling deterministic. The database persists this mapping in production.
export function idempotentMutation(cache, actionId, run) {
  if (cache.has(actionId)) return { duplicate: true, ...cache.get(actionId) };
  const value = run();
  cache.set(actionId, value);
  return { duplicate: false, ...value };
}
