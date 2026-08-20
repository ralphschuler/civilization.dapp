/**
 * A small, UI-independent state machine for wallet intent review.  The payload
 * is copied and deeply frozen before it can be shown or dispatched, so a later
 * form edit can never change what the user reviewed.
 */
function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, copy(item)]),
    );
  return value;
}

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function createWalletIntent(type, payload = {}, details = []) {
  if (typeof type !== "string" || !type) throw new Error("invalid_action");
  return freeze({ type, payload: copy(payload), details: [...details] });
}

export function createWalletReview() {
  let state = freeze({ status: "idle", intent: null, reason: null });
  const set = (next) => (state = freeze(next));
  return {
    state: () => state,
    begin(type, payload, details) {
      if (state.status === "confirming" || state.status === "pending")
        throw new Error("transaction_pending");
      return set({
        status: "reviewing",
        intent: createWalletIntent(type, payload, details),
        reason: null,
      });
    },
    confirm() {
      if (state.status !== "reviewing") throw new Error("review_not_available");
      return set({ ...state, status: "confirming" });
    },
    cancel() {
      if (!["reviewing", "invalidated"].includes(state.status))
        throw new Error("review_not_available");
      return set({ ...state, status: "cancelled" });
    },
    invalidate(reason = "inputs_changed") {
      if (state.status !== "reviewing") return state;
      return set({ ...state, status: "invalidated", reason });
    },
    pending() {
      if (state.status !== "confirming")
        throw new Error("review_not_available");
      return set({ ...state, status: "pending" });
    },
    confirmed() {
      return set({ ...state, status: "confirmed" });
    },
    reverted(reason = "transaction_failed") {
      return set({ ...state, status: "reverted", reason });
    },
    clear() {
      return set({ status: "idle", intent: null, reason: null });
    },
  };
}
