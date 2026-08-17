import {
  clock,
  compactResourceValue,
  productionRateText,
} from "./game-ui/helpers.js";
import { boostConstructionStatus } from "./game-ui/boost-status.js";
import { constructionBoostEligibility } from "./world-game/boost-eligibility.js";

export function refreshGameTick({
  root,
  state,
  busy,
  mode,
  production,
  displayState,
  collection,
  resourceFormat,
  remainingTime,
  copy = { production: "Produktion", collect: "sammeln" },
}) {
  const resourceIds = new Set([
    ...Object.keys(displayState.unclaimed ?? {}),
    ...Object.keys(production ?? {}),
  ]);
  const compactValue = (value) => compactResourceValue(value, resourceFormat);
  for (const id of resourceIds) {
    const rate = production?.[id];
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

    const productionNode = root.querySelector(
      `[data-resource="${id}"] [data-resource-production]`,
    );
    const productionValue = root.querySelector(
      `[data-resource="${id}"] [data-resource-production-value]`,
    );
    const accessibleProduction = root.querySelector(
      `[data-resource="${id}"] [data-resource-accessible-production]`,
    );
    const productionText = productionRateText({
      resourceId: id,
      rate,
      mode,
      formatValue: compactValue,
    });
    const accessibleProductionText = productionRateText({
      resourceId: id,
      rate,
      mode,
      formatValue: resourceFormat,
    });
    const hasProduction = productionText !== "";
    if (productionNode) productionNode.hidden = !hasProduction;
    if (productionValue) productionValue.textContent = productionText;
    if (accessibleProduction) {
      accessibleProduction.textContent = hasProduction
        ? `${copy.production}: ${accessibleProductionText}`
        : "";
      accessibleProduction.hidden = !hasProduction;
    }
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

  updateRaidCountdown(root, state, busy, remainingTime);
  updateConstructionCountdown(root, state, busy, remainingTime);
}

function updateRaidCountdown(root, state, busy, remainingTime) {
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
  resolve.textContent = seconds ? "Marsch läuft" : "Schlacht auswerten";
}

function updateConstructionCountdown(root, state, busy, remainingTime) {
  const countdown = root.querySelector("[data-construction-countdown]");
  if (!countdown || !state.construction?.pending) {
    return;
  }

  const seconds = remainingTime(state.construction.completesAt);
  countdown.textContent = seconds ? clock(seconds) : "Fertig";
  const complete = root.querySelector("#complete-upgrade");
  const boost = root.querySelector("#boost-construction");
  const boostStatus = root.querySelector("[data-boost-construction-status]");
  if (complete) {
    complete.disabled = seconds > 0 || busy;
    complete.textContent = seconds ? "Bau läuft" : "Ausbau abschließen";
  }
  if (boost) {
    const eligibility = constructionBoostEligibility({
      construction: state.construction,
      remainingSeconds: seconds,
      busy,
    });
    boost.disabled = !eligibility.eligible;
    if (boostStatus) {
      boostStatus.textContent = boostConstructionStatus(eligibility.reason);
    }
  }
}
