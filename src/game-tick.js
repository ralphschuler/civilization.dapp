import { clock, compactResourceValue } from "./game-ui/helpers.js";
import { boostConstructionStatus } from "./game-ui/boost-status.js";
import { constructionBoostEligibility } from "./world-game/boost-eligibility.js";
import { civilizationMessages } from "./lib/civilization-locale.ts";

export function refreshGameTick({
  root,
  state,
  busy,
  production,
  displayState,
  collection,
  resourceFormat,
  remainingTime,
  locale = "de-DE",
  copy = civilizationMessages("de-DE"),
}) {
  const resourceIds = new Set([
    ...Object.keys(displayState.unclaimed ?? {}),
    ...Object.keys(production ?? {}),
  ]);
  const compactValue = (value) =>
    compactResourceValue(value, resourceFormat, locale);
  for (const id of resourceIds) {
    const fieldStock = Number.isFinite(displayState.unclaimed?.[id])
      ? displayState.unclaimed[id]
      : 0;
    const collectionValue = root.querySelector(
      `[data-collection-resource="${id}"] [data-collection-resource-value]`,
    );
    if (collectionValue) {
      collectionValue.textContent = compactValue(fieldStock);
    }
    const accessibleCollectionValue = root.querySelector(
      `[data-collection-resource-accessible="${id}"]`,
    );
    if (accessibleCollectionValue) {
      accessibleCollectionValue.textContent = resourceFormat(fieldStock);
    }

    // Resource HUD values are React-owned. The imperative tick retains only
    // collection, action, and panel updates below.
  }

  const total = Object.values(displayState.unclaimed ?? {}).reduce(
    (sum, value) => sum + value,
    0,
  );
  const claimText = collection.locked
    ? collection.label
    : `${resourceFormat(total)} ${copy.collect}`;
  const claim = root.querySelector("[data-ready-to-claim]");
  if (claim) claim.textContent = claimText;
  const accessibleClaim = root.querySelector(
    "[data-ready-to-claim-accessible]",
  );
  if (accessibleClaim) accessibleClaim.textContent = claimText;

  const gather = root.querySelector("#gather");
  if (gather) {
    gather.disabled = collection.locked || busy;
    gather.querySelector("[data-collection-status]").textContent =
      collection.detail;
  }

  updateRaidCountdown(root, state, busy, remainingTime, copy);
  updateConstructionCountdown(root, state, busy, remainingTime, copy);
}

function updateRaidCountdown(root, state, busy, remainingTime, copy) {
  const countdown = root.querySelector("[data-raid-countdown]");
  if (!countdown || !state.pendingRaid) {
    return;
  }

  const seconds = remainingTime(state.pendingRaid.arrivesAt);
  countdown.textContent = clock(seconds);
  const resolve = root.querySelector("#resolve-raid");
  if (!resolve) {
    return;
  }
  resolve.disabled = seconds > 0 || busy;
  resolve.textContent = seconds ? copy.constructionRunning : copy.resolveBattle;
}

function updateConstructionCountdown(root, state, busy, remainingTime, copy) {
  if (
    typeof root.querySelectorAll === "function" &&
    state.constructions?.length
  ) {
    root.querySelectorAll("[data-construction-job]").forEach((job) => {
      const slot = Number(job.dataset.constructionSlot);
      const construction = state.constructions.find(
        (item) => item.slot === slot,
      );
      if (!construction) return;
      const seconds = remainingTime(construction.completesAt);
      const countdown = job.querySelector("[data-construction-countdown]");
      if (countdown)
        countdown.textContent = seconds ? clock(seconds) : copy.complete;
      const complete = job.querySelector("[data-complete-upgrade]");
      if (complete) complete.disabled = seconds > 0 || busy;
      const boost = job.querySelector("[data-boost-construction]");
      const status = job.querySelector("[data-boost-construction-status]");
      const eligibility = constructionBoostEligibility({
        construction,
        remainingSeconds: seconds,
        busy,
      });
      if (boost) boost.disabled = !eligibility.eligible;
      if (status)
        status.textContent = boostConstructionStatus(eligibility.reason, copy);
    });
    return;
  }
  const countdown = root.querySelector("[data-construction-countdown]");
  if (!countdown || !state.construction?.pending) {
    return;
  }

  const seconds = remainingTime(state.construction.completesAt);
  countdown.textContent = seconds ? clock(seconds) : copy.complete;
  const complete = root.querySelector("#complete-upgrade");
  const boost = root.querySelector("#boost-construction");
  const boostStatus = root.querySelector("[data-boost-construction-status]");
  if (complete) {
    complete.disabled = seconds > 0 || busy;
    complete.textContent = seconds
      ? copy.constructionRunning
      : copy.completeUpgrade;
  }
  if (boost) {
    const eligibility = constructionBoostEligibility({
      construction: state.construction,
      remainingSeconds: seconds,
      busy,
    });
    boost.disabled = !eligibility.eligible;
    if (boostStatus) {
      boostStatus.textContent = boostConstructionStatus(
        eligibility.reason,
        copy,
      );
    }
  }
}
