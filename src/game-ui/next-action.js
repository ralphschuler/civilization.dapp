/**
 * Select the one thing a player can usefully do next.  This deliberately uses
 * only state already shown in the village/build surfaces; it does not inspect
 * wallet, review, or network state and it never performs an action itself.
 */
export function deriveNextAction({
  collection,
  jobs,
  remainingTime,
  level,
  maxLevel,
  requirements,
  affordable,
  atCapacity,
}) {
  const claimable =
    collection &&
    !collection.locked &&
    Object.values(collection.unclaimed || {}).some(
      (value) => Number(value) > 0,
    );
  if (claimable) return { kind: "collect" };

  const readyJob = (jobs || []).find(
    (job) => remainingTime(job.completesAt) <= 0,
  );
  if (readyJob) return { kind: "complete", slot: readyJob.slot };

  if (level >= maxLevel) return { kind: "max-level" };
  if ((requirements || []).length) return { kind: "requirements" };
  if (atCapacity) return { kind: "capacity" };
  if (affordable) return { kind: "upgrade" };
  return { kind: "resources" };
}
