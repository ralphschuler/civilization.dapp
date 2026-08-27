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
  const readyJob = (jobs || []).find(
    (job) => remainingTime(job.completesAt) <= 0,
  );
  // Claiming field stock is optional. A ready construction can be completed
  // independently, and the on-chain completion settles its own accrual.
  if (readyJob) return { kind: "complete", slot: readyJob.slot };

  const claimable =
    collection &&
    !collection.locked &&
    Object.values(collection.unclaimed || {}).some(
      (value) => Number(value) > 0,
    );
  if (claimable) return { kind: "collect" };

  if (level >= maxLevel) return { kind: "max-level" };
  if ((requirements || []).length) return { kind: "requirements" };
  if (atCapacity) return { kind: "capacity" };
  if (affordable) return { kind: "upgrade" };
  return { kind: "resources" };
}

/**
 * A read-only, focus-only interpretation of the next action. Keeping this
 * separate from action handlers makes the entry guide safe to render from an
 * on-chain projection: it names one existing control, but never invokes it.
 */
export function deriveEntryGuide({
  state,
  selectedBuilding,
  buildings,
  ...input
}) {
  if (
    !state ||
    !selectedBuilding ||
    !Number.isFinite(state.buildings?.[selectedBuilding]) ||
    !buildings?.[selectedBuilding]
  ) {
    return { kind: "unavailable", target: "none" };
  }
  const action = deriveNextAction(input);
  if (action.kind === "collect") return { ...action, target: "collection" };
  if (action.kind === "complete") return { ...action, target: "completion" };
  if (action.kind === "requirements") {
    return {
      ...action,
      target: "building",
      buildingId: input.requirements?.[0]?.id || selectedBuilding,
    };
  }
  if (action.kind === "capacity") return { ...action, target: "build-panel" };
  return { ...action, target: "building", buildingId: selectedBuilding };
}
