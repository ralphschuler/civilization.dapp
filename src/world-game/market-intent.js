const TRADABLE_RESOURCES = Object.freeze(["wood", "clay", "stone"]);

function freeze(value) {
  return Object.freeze(value);
}

/**
 * Captures the fields a market confirmation is allowed to display and submit.
 * This deliberately has no reference to the editable form draft or the adapter
 * response, so a render or later input event cannot change a reviewed order.
 */
export function createMarketOrderIntent(side, quote) {
  if (
    (side !== "buy" && side !== "sell") ||
    !quote ||
    !TRADABLE_RESOURCES.includes(quote.resource) ||
    !Number.isSafeInteger(quote.amount) ||
    quote.amount < 1 ||
    !Number.isSafeInteger(quote.deadline) ||
    quote.deadline < 1
  )
    return null;

  const limit = side === "buy" ? quote.buyGoldIn : quote.sellGoldOut;
  if (typeof limit !== "bigint") return null;

  const payload = freeze({
    resource: quote.resource,
    amount: quote.amount,
    limit,
    deadline: quote.deadline,
  });
  return freeze({
    side,
    type: side === "buy" ? "market_buy" : "market_sell",
    payload,
  });
}

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
