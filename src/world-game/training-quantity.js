/**
 * UI-safe training arithmetic. The contract remains the authority; these
 * helpers only prevent an impossible value from reaching its single call.
 */
export function maxTrainableAmount(resources, cost) {
  const limits = Object.entries(cost || {})
    .filter(([, unitCost]) => Number.isSafeInteger(unitCost) && unitCost > 0)
    .map(([resource, unitCost]) => {
      const available = resources?.[resource];
      return Number.isSafeInteger(available) && available >= 0
        ? Math.floor(available / unitCost)
        : 0;
    });

  // A troop without a positive cost is not a valid selectable quantity. This
  // avoids manufacturing a product cap for a configuration the UI cannot price.
  return limits.length ? Math.min(...limits, Number.MAX_SAFE_INTEGER) : 0;
}

/** @returns {Record<string, number> | null} */
export function trainingCost(cost, amount) {
  if (!Number.isSafeInteger(amount) || amount < 1) return null;
  const total = {};
  for (const [resource, unitCost] of Object.entries(cost || {})) {
    if (!Number.isSafeInteger(unitCost) || unitCost < 0) return null;
    const value = unitCost * amount;
    if (!Number.isSafeInteger(value)) return null;
    total[resource] = value;
  }
  return total;
}

export function validateTrainingAmount(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1)
    return { ok: false, reason: "invalid" };
  if (!Number.isSafeInteger(maximum) || maximum < 1 || value > maximum)
    return { ok: false, reason: "unaffordable" };
  return { ok: true, amount: value };
}
