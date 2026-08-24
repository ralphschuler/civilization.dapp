const TRADABLE_RESOURCES = Object.freeze(["wood", "clay", "stone"]);

/**
 * Turns a read-only resource deficit into a market draft without ever rounding
 * it. Gold is deliberately excluded: the market sells resources for CGOLD and
 * must not pretend it can fund the payment token itself.
 */
export function marketPrefill(deficits) {
  if (!deficits || typeof deficits !== "object") return null;
  for (const resource of TRADABLE_RESOURCES) {
    const amount = deficits[resource];
    if (Number.isSafeInteger(amount) && amount > 0)
      return Object.freeze({ resource, amount });
  }
  return null;
}

export function marketPrefills(deficits) {
  if (!deficits || typeof deficits !== "object") return [];
  return TRADABLE_RESOURCES.flatMap((resource) => {
    const amount = deficits[resource];
    return Number.isSafeInteger(amount) && amount > 0
      ? [Object.freeze({ resource, amount })]
      : [];
  });
}

export { TRADABLE_RESOURCES };
