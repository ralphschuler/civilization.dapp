import { compactResourceValue } from "./game-ui/helpers.js";
import { civilizationMessages } from "./lib/civilization-locale.ts";

export function refreshGameTick({
  root,
  busy,
  production,
  displayState,
  collection,
  resourceFormat,
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
}
