export function deriveGateState({
  access,
  mode,
  ready,
  state,
  loading,
  feedback,
  copy,
}) {
  if (!access) {
    return {
      kind: "access",
      detail: copy.accessDetail,
      title: copy.accessRequired,
    };
  }
  if (mode === "world" && (!ready || !state)) {
    return {
      feedback,
      kind: "runtime",
      loading,
      retryLabel: copy.retry,
      title: loading ? copy.loadingWorld : copy.worldUnavailable,
    };
  }
  return null;
}

// This deliberately performs one runtime refresh for each user retry. The
// runtime itself rejects overlapping refreshes.
export function createGateRetryHandle(refresh) {
  return () => refresh();
}
