import { createWalletReview } from "./world-game/review.js";

export function createWorldRuntime({
  runtime,
  isCurrent,
  render,
  errorText,
  hasAccess,
  copy,
  onReadSnapshot = () => {},
}) {
  runtime.review ||= createWalletReview();
  async function dispatchReviewedAction(intent, successMessage) {
    if (!runtime.ready || !runtime.adapter || runtime.busy) return null;

    const token = runtime.token;
    runtime.busy = true;
    runtime.feedback = copy().feedback.worldTransactionConfirmation;
    render();

    try {
      const result = await runtime.adapter.execute(intent.type, intent.payload);
      if (!isCurrent(token)) return null;

      runtime.worldStateEpoch += 1;
      runtime.state = result.state;
      onReadSnapshot(result.state);
      if (
        intent.type === "market_buy" &&
        !result.pending &&
        runtime.marketOrigin
      ) {
        runtime.activePanel = runtime.marketOrigin.panel || "build";
        runtime.marketOrigin = { ...runtime.marketOrigin, completed: true };
      }
      if (result.pending) runtime.review.pending();
      else runtime.review.confirmed();
      runtime.feedback = result.pending
        ? copy().feedback.worldTransactionPending
        : successMessage;
      return result;
    } catch (error) {
      if (isCurrent(token)) {
        runtime.review.reverted(
          error instanceof Error ? error.message : "transaction_failed",
        );
        runtime.feedback = errorText(error);
      }
      return null;
    } finally {
      if (!isCurrent(token)) return;
      runtime.busy = false;
      render();
    }
  }

  function requestAction(type, payload, successMessage, details = []) {
    if (!runtime.ready || !runtime.adapter || runtime.busy) return null;
    runtime.review.begin(type, payload, details);
    runtime.feedback = copy().feedback.reviewRequired;
    render();
    return null;
  }

  async function confirmReview(successMessage) {
    const snapshot = runtime.review.state();
    if (snapshot.status !== "reviewing" || !snapshot.intent) return null;
    runtime.review.confirm();
    return dispatchReviewedAction(snapshot.intent, successMessage);
  }

  function cancelReview() {
    const snapshot = runtime.review.state();
    if (!["reviewing", "invalidated"].includes(snapshot.status)) return;
    runtime.review.cancel();
    runtime.feedback = copy().feedback.reviewCancelled;
    render();
  }

  async function resumePending(token) {
    runtime.busy = true;
    runtime.feedback = copy().feedback.pendingTransactionChecking;
    render();

    try {
      const result = await runtime.adapter.resumePending();
      if (!isCurrent(token)) return;

      runtime.worldStateEpoch += 1;
      runtime.state = result?.state || runtime.state;
      if (result?.state) onReadSnapshot(result.state);
      runtime.feedback = result?.pending
        ? copy().feedback.pendingTransactionStillPending
        : copy().feedback.pendingTransactionConfirmed;
    } catch (error) {
      if (isCurrent(token)) runtime.feedback = errorText(error);
    } finally {
      if (!isCurrent(token)) return;
      runtime.busy = false;
      render();
    }
  }

  async function refresh({ quiet = false } = {}) {
    if (
      runtime.mode !== "world" ||
      !runtime.adapter ||
      !hasAccess() ||
      runtime.refreshing
    )
      return;

    const token = runtime.token;
    const requestEpoch = runtime.worldStateEpoch;
    runtime.refreshing = true;
    if (!quiet) runtime.loading = true;

    try {
      const nextState = await runtime.adapter.readState();
      if (!isCurrent(token) || requestEpoch !== runtime.worldStateEpoch) return;

      runtime.state = nextState;
      onReadSnapshot(nextState);
      const review = runtime.review.state();
      if (review.status === "reviewing" && review.intent?.type === "upgrade") {
        runtime.review.invalidate("world_state_changed");
        runtime.feedback = copy().feedback.reviewWorldStateInvalidated;
      }
      runtime.ready = true;
      runtime.loading = false;
      if (!quiet) {
        runtime.feedback = copy().feedback.worldStateLoaded;
      }
      render();

      if (runtime.adapter.hasPending?.()) await resumePending(token);
    } catch (error) {
      if (!isCurrent(token)) return;
      runtime.ready = false;
      runtime.loading = false;
      runtime.feedback = errorText(error);
      render();
    } finally {
      if (isCurrent(token)) runtime.refreshing = false;
    }
  }

  function requestBuildDuration(buildingId, nextLevel, maximumLevel) {
    if (
      runtime.mode !== "world" ||
      !runtime.adapter ||
      !Number.isInteger(nextLevel)
    )
      return;
    if (nextLevel > maximumLevel) return;

    const key = `${buildingId}:${nextLevel}`;
    if (runtime.durations.has(key)) return;

    const token = runtime.token;
    runtime.durations.set(key, null);
    runtime.adapter
      .readBuildDuration(buildingId, nextLevel)
      .then((seconds) => {
        if (!isCurrent(token)) return;
        runtime.durations.set(key, Number(seconds));
        render();
      })
      .catch(() => {
        if (!isCurrent(token)) return;
        runtime.durations.set(key, false);
        render();
      });
  }

  // Kept for non-UI callers and existing read-only harnesses. The application
  // exclusively uses requestAction/confirmReview, so browser writes cannot
  // bypass the review step.
  const performAction = (type, payload, successMessage) =>
    dispatchReviewedAction({ type, payload }, successMessage);
  return {
    performAction,
    requestAction,
    confirmReview,
    cancelReview,
    refresh,
    requestBuildDuration,
  };
}
