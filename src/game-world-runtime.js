export function createWorldRuntime({
  runtime,
  isCurrent,
  render,
  errorText,
  hasAccess,
  copy,
}) {
  async function performAction(type, payload, successMessage) {
    if (!runtime.ready || !runtime.adapter || runtime.busy) return null;

    const token = runtime.token;
    runtime.busy = true;
    runtime.feedback = copy().feedback.worldTransactionConfirmation;
    render();

    try {
      const result = await runtime.adapter.execute(type, payload);
      if (!isCurrent(token)) return null;

      runtime.worldStateEpoch += 1;
      runtime.state = result.state;
      runtime.feedback = result.pending
        ? copy().feedback.worldTransactionPending
        : successMessage;
      return result;
    } catch (error) {
      if (isCurrent(token)) runtime.feedback = errorText(error);
      return null;
    } finally {
      if (!isCurrent(token)) return;
      runtime.busy = false;
      render();
    }
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

  return { performAction, refresh, requestBuildDuration };
}
