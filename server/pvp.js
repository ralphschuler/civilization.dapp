import { createHash } from "node:crypto";
import { MARCH_DURATION_MS, RESOURCE_DEFS, TROOPS, getCapacity, settle } from "../src/game.js";

export const PUBLIC_VILLAGE_ID_PATTERN = /^v_[A-Za-z0-9_-]{22,64}$/;
const resources = () => Object.fromEntries(Object.keys(RESOURCE_DEFS).map((id) => [id, 0]));

export function validatePublicVillageId(value) {
  return typeof value === "string" && PUBLIC_VILLAGE_ID_PATTERN.test(value);
}

// Deliberately contains no internal/browser identifier or protected resources.
export function publicTarget(publicVillageId, state) {
  return {
    id: publicVillageId,
    name: `Online-Dorf ${publicVillageId.slice(-6).toUpperCase()}`,
    defense: defenseFor(state),
    unclaimed: { ...state.unclaimed },
  };
}

function defenseFor(state) {
  const troopDefense = Object.entries(TROOPS).reduce((total, [id, troop]) => total + (state.troops[id] || 0) * troop.attack, 0);
  return Math.max(1, Math.floor(troopDefense * 0.65) + (state.buildings.townhall || 0) * 20);
}

function normalizedArmy(selected) {
  return Object.fromEntries(Object.keys(TROOPS).map((id) => [id, Math.max(0, Math.floor(Number(selected[id]) || 0))]));
}

function randomFraction(seed) {
  return createHash("sha256").update(seed).digest().readUInt32BE(0) / 0x1_0000_0000;
}

function availableLoot(attacker, defender) {
  const result = resources();
  const stock = defender.unclaimed || resources();
  let remainingCapacity = Math.max(0, getCapacity(attacker) - Object.values(attacker.resources).reduce((total, amount) => total + amount, 0));
  for (const id of Object.keys(RESOURCE_DEFS)) {
    const amount = Math.min(Math.max(0, Math.floor(stock[id] || 0)), remainingCapacity);
    result[id] = amount;
    remainingCapacity -= amount;
  }
  return result;
}

// The server commits to the random seed when a march starts, then reveals it in
// the battle report. Clients never choose either value.
export function seedCommit(seed) {
  return createHash("sha256").update(seed).digest("hex");
}

export function startPvpRaid(attacker, attackerPublicId, defenderPublicId, selected, now, seed) {
  if (!validatePublicVillageId(defenderPublicId) || defenderPublicId === attackerPublicId) return { ok: false, reason: "target" };
  settle(attacker, now);
  if (attacker.pendingRaid) return { ok: false, reason: "march" };
  const army = normalizedArmy(selected);
  const total = Object.values(army).reduce((sum, amount) => sum + amount, 0);
  if (!total) return { ok: false, reason: "army" };
  if (Object.keys(army).some((id) => army[id] > attacker.troops[id])) return { ok: false, reason: "availability" };
  attacker.pendingRaid = {
    kind: "pvp", targetId: defenderPublicId, army, arrivesAt: now + MARCH_DURATION_MS,
    seed: Buffer.from(seed).toString("base64url"), seedCommit: seedCommit(seed),
  };
  const { seed: _seed, ...publicRaid } = attacker.pendingRaid;
  return { ok: true, ...publicRaid };
}

// `seed` was generated when the march started. It is never accepted from a client.
export function resolvePvpRaid(attacker, defender, attackerPublicId, defenderPublicId, now, seed) {
  const pending = attacker.pendingRaid;
  if (!pending || pending.kind !== "pvp" || pending.targetId !== defenderPublicId || now < pending.arrivesAt) return { ok: false, reason: "march" };
  const army = normalizedArmy(pending.army);
  if (!Object.values(army).some(Boolean) || Object.keys(army).some((id) => army[id] > attacker.troops[id])) return { ok: false, reason: "army" };
  settle(attacker, now);
  settle(defender, now);
  const attack = Object.entries(army).reduce((total, [id, amount]) => total + TROOPS[id].attack * amount, 0);
  const defense = defenseFor(defender);
  const won = attack * (0.9 + randomFraction(seed) * 0.2) >= defense;
  const casualtyRate = won ? 0.08 : 0.38;
  const casualties = Object.fromEntries(Object.keys(TROOPS).map((id) => [id, Math.min(army[id], Math.ceil(army[id] * casualtyRate))]));
  const defenderCasualties = won
    ? Object.fromEntries(Object.keys(TROOPS).map((id) => [id, Math.min(defender.troops[id], Math.floor(defender.troops[id] * 0.06))]))
    : Object.fromEntries(Object.keys(TROOPS).map((id) => [id, 0]));
  Object.keys(TROOPS).forEach((id) => { attacker.troops[id] -= casualties[id]; defender.troops[id] -= defenderCasualties[id] || 0; });
  const stolen = won ? availableLoot(attacker, defender) : resources();
  Object.keys(RESOURCE_DEFS).forEach((id) => {
    defender.unclaimed[id] -= stolen[id];
    attacker.resources[id] += stolen[id];
  });
  attacker.pendingRaid = null;
  attacker.raids += 1;
  attacker.lastRaid = { ok: won, target: `Online-Dorf ${defenderPublicId.slice(-6).toUpperCase()}`, stolen, casualties, attack, defense, attackerVillageId: attackerPublicId, defenderVillageId: defenderPublicId, seed: Buffer.from(seed).toString("base64url"), seedCommit: pending.seedCommit };
  return { ok: true, ...attacker.lastRaid };
}
