/**
 * A compact, read-only view of the latest authoritative village snapshot.
 * It intentionally has no clock: construction readiness is decided solely
 * from the timestamp returned with the chain read.
 */
export function projectCurrentVillageSummary({ state, collection, unclaimed }) {
  if (!state?.registered || !Number.isFinite(state.chainTimestamp)) return null;

  const jobs = state.constructions?.length
    ? state.constructions
    : state.construction?.pending
      ? [state.construction]
      : [];
  const ready = jobs.find(
    (job) =>
      job?.pending &&
      Number.isFinite(job.completesAt) &&
      job.completesAt <= state.chainTimestamp,
  );
  const collectible =
    !collection?.locked &&
    Object.values(unclaimed || {}).some((value) => Number(value) > 0);

  return {
    ready: ready
      ? {
          buildingId: ready.buildingId,
          slot: Number.isInteger(ready.slot) ? ready.slot : 0,
        }
      : null,
    collectible,
    // Build is a focus route only; it never starts an upgrade.
    showBuild: !ready && !collectible,
  };
}
