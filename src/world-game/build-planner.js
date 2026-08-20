import { BUILDING_IDS } from "./constants.js";

const resources = ["wood", "clay", "stone", "gold"];
const compareSteps = (a, b) => a.id.localeCompare(b.id) || a.level - b.level;

function blocked(reason, detail = null) {
  return { ok: false, reason, detail, steps: [], next: null, durationKeys: [] };
}

/**
 * Deterministic read-only construction plan. The caller supplies only
 * contract-parity projections; missing or malformed projection data blocks the
 * plan instead of guessing a rule, price, duration, or queue state.
 */
export function planBuildingDependencies({
  state,
  target,
  requirementsForLevel,
  buildingCost,
  buildDuration,
  constructionCapacity,
  maximumLevel = 30,
}) {
  if (!state?.buildings || !state?.resources || !target)
    return blocked("state_unavailable");
  if (
    !BUILDING_IDS.includes(target.id) ||
    !Number.isInteger(target.level) ||
    target.level < 1 ||
    target.level > maximumLevel
  )
    return blocked("invalid_target");
  if (
    typeof requirementsForLevel !== "function" ||
    typeof buildingCost !== "function" ||
    typeof buildDuration !== "function" ||
    typeof constructionCapacity !== "function"
  )
    return blocked("projection_unavailable");
  const levels = { ...state.buildings };
  if (
    BUILDING_IDS.some((id) => !Number.isInteger(levels[id]) || levels[id] < 0)
  )
    return blocked("invalid_building_levels");
  if (
    resources.some(
      (id) => !Number.isFinite(state.resources[id]) || state.resources[id] < 0,
    )
  )
    return blocked("invalid_resources");
  const now = state.chainTimestamp;
  if (!Number.isFinite(now)) return blocked("time_unavailable");
  const jobs =
    state.constructions ||
    (state.construction?.pending ? [state.construction] : []);
  if (!Array.isArray(jobs)) return blocked("construction_state_unavailable");
  const active = new Map();
  for (const job of jobs) {
    if (
      !job?.pending ||
      !BUILDING_IDS.includes(job.buildingId) ||
      !Number.isInteger(job.slot) ||
      !Number.isFinite(job.completesAt) ||
      job.completesAt < now
    )
      return blocked("invalid_construction_state");
    const level = levels[job.buildingId] + 1;
    const key = `${job.buildingId}:${level}`;
    if (active.has(key)) return blocked("conflicting_construction_state", key);
    active.set(key, job);
  }
  const nodes = new Map();
  const visiting = new Set();
  const visit = (id, level) => {
    const key = `${id}:${level}`;
    if (levels[id] >= level || nodes.has(key)) return true;
    if (visiting.has(key)) throw new Error(`dependency_cycle:${key}`);
    visiting.add(key);
    if (level > 1) visit(id, level - 1);
    let requirements;
    try {
      requirements = requirementsForLevel(id, level);
    } catch {
      throw new Error("requirements_unavailable");
    }
    if (!Array.isArray(requirements))
      throw new Error("requirements_unavailable");
    for (const requirement of [...requirements].sort(compareSteps)) {
      if (
        !BUILDING_IDS.includes(requirement?.id) ||
        !Number.isInteger(requirement.level) ||
        requirement.level < 1 ||
        requirement.level > maximumLevel
      )
        throw new Error("invalid_requirement");
      visit(requirement.id, requirement.level);
    }
    nodes.set(key, {
      id,
      level,
      key,
      dependencies: [...requirements].map((item) => `${item.id}:${item.level}`),
      active: active.get(key) || null,
    });
    visiting.delete(key);
    return true;
  };
  try {
    visit(target.id, target.level);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "requirements_unavailable";
    return blocked(
      message.startsWith("dependency_cycle") ? "dependency_cycle" : message,
      message,
    );
  }
  const ordered = [...nodes.values()];
  const durationKeys = ordered
    .filter((node) => !node.active)
    .map(({ id, level }) => `${id}:${level}`);
  for (const node of ordered) {
    if (node.active) continue;
    let cost;
    try {
      cost = buildingCost(
        { ...state, buildings: { ...levels, [node.id]: node.level - 1 } },
        node.id,
      );
    } catch {
      return blocked("cost_unavailable");
    }
    if (
      !cost ||
      resources.some((id) => !Number.isFinite(cost[id]) || cost[id] < 0)
    )
      return blocked("cost_unavailable");
    const duration = buildDuration(node.id, node.level);
    if (!Number.isFinite(duration) || duration < 0)
      return { ...blocked("duration_unavailable"), durationKeys };
    node.cost = cost;
    node.duration = duration;
  }
  let capacity;
  try {
    capacity = constructionCapacity(state);
  } catch {
    return blocked("construction_capacity_unavailable");
  }
  if (
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 3 ||
    jobs.length > capacity
  )
    return blocked("construction_capacity_unavailable");
  if (jobs.some((job) => job.slot >= capacity))
    return blocked("construction_capacity_unavailable");
  const slots = Array.from({ length: capacity }, () => now);
  for (const job of jobs) slots[job.slot] = job.completesAt;
  const remaining = { ...state.resources };
  const byKey = new Map();
  for (const node of ordered) {
    if (node.active) {
      node.earliestStart = now;
      node.completesAt = node.active.completesAt;
      node.slot = node.active.slot;
      byKey.set(node.key, node);
      continue;
    }
    const dependencies = node.dependencies
      .map((key) => byKey.get(key))
      .filter(Boolean);
    const dependencyReadyAt = dependencies.reduce(
      (latest, dependency) => Math.max(latest, dependency.completesAt || now),
      now,
    );
    const slot = slots.reduce(
      (best, availableAt, index) => (availableAt < slots[best] ? index : best),
      0,
    );
    node.slot = slot;
    node.earliestStart = Math.max(dependencyReadyAt, slots[slot]);
    node.completesAt = node.earliestStart + node.duration * 1000;
    slots[slot] = node.completesAt;
    node.deficits = Object.fromEntries(
      resources
        .map((id) => [id, Math.max(0, node.cost[id] - remaining[id])])
        .filter(([, amount]) => amount),
    );
    node.affordable = Object.keys(node.deficits).length === 0;
    if (node.affordable)
      resources.forEach((id) => {
        remaining[id] -= node.cost[id];
      });
    byKey.set(node.key, node);
  }
  const next =
    ordered.find(
      (node) =>
        !node.active &&
        node.dependencies.every((key) => !byKey.get(key)?.active) &&
        node.earliestStart <= now &&
        node.affordable,
    ) || null;
  return { ok: true, reason: null, steps: ordered, next, durationKeys };
}
