import {
  BUILDING_ASSETS,
  BUILDING_IDS,
  CITY_MAPS,
  RESOURCE_ASSETS,
} from "../constants.js";
import { mapBuildingAnchorStyle } from "../map-coordinates.js";
import { compactResourceValue, escapeHtml } from "../helpers.js";
import { civilizationMessages } from "../../lib/civilization-locale.ts";
// Game feedback can include provider, contract, or contact supplied text.
// Keep this as the sole markup boundary for the imperative game shell.
function feedbackText(feedback) {
  return escapeHtml(feedback);
}

function assetFailed(assetResult, src) {
  return assetResult?.failed.includes(src);
}

function collectionResources({
  resourceDefs,
  displayState,
  resourceFormat,
  copy,
  locale,
  assetResult,
}) {
  const resources = Object.entries(resourceDefs).map(([id, definition]) => {
    const value = Number.isFinite(displayState.unclaimed?.[id])
      ? displayState.unclaimed[id]
      : 0;
    return { id, label: copy.resourceNames[id] || definition.label, value };
  });
  const compactValue = (value) =>
    compactResourceValue(value, resourceFormat, locale);
  return `
    <span class="collection-resources" aria-hidden="true">
      ${resources
        .map(
          ({ id, label, value }) => `
            <span class="collection-resource ${assetFailed(assetResult, RESOURCE_ASSETS[id]) ? "has-asset-error" : ""}" data-collection-resource="${id}" data-asset-container>
              <img src="${RESOURCE_ASSETS[id]}" alt="" aria-hidden="true" data-asset-fallback>
              <span class="asset-icon-fallback" role="status">${copy.resourceAssetUnavailable(label)}</span>
              <b data-collection-resource-value>${compactValue(value)}</b>
            </span>`,
        )
        .join("")}
    </span>
    <span class="collection-accessibility">
      ${copy.fieldResources}: ${resources
        .map(
          ({ id, label, value }) =>
            `${label} <span data-collection-resource-accessible="${id}">${resourceFormat(value)}</span>`,
        )
        .join("; ")}.
    </span>`;
}

function buildingSpot(id, ctx) {
  const { buildings, state, selectedBuilding, activePanel, copy, assetResult } =
    ctx;
  const label = copy.buildingNames[id] || buildings[id].label;
  return `
    <button class="map-building map-${id} ${selectedBuilding === id && activePanel === "build" ? "is-selected" : ""} ${assetFailed(assetResult, BUILDING_ASSETS[id]) ? "has-asset-error" : ""}"
      data-map-building="${id}" data-map-anchor="bottom-center" style="${mapBuildingAnchorStyle(id)}" aria-label="${label}, ${copy.level} ${state.buildings[id]}" data-asset-container>
      <img src="${BUILDING_ASSETS[id]}" alt="" data-asset-fallback>
      <i class="asset-building-fallback" role="status">${copy.buildingAssetUnavailable(label)}</i>
      <span>
<b>${label}</b>
<small>LVL ${state.buildings[id]}</small>
</span>
    </button>`;
}

function tabs(activePanel, copy, variant = "desktop") {
  return [
    ["build", copy.build],
    ["army", copy.army],
    ["market", copy.market],
    ["raid", copy.raid],
  ]
    .map(([id, label]) => {
      const visibleLabel =
        variant === "mobile" && id === "build"
          ? copy.buildShort
          : variant === "mobile" && id === "army"
            ? copy.armyShort
            : label;
      return `<button type="button" data-panel="${id}" class="${activePanel === id ? "is-active" : ""}" aria-label="${label}" ${activePanel === id ? 'aria-current="page"' : ""}>${visibleLabel}</button>`;
    })
    .join("");
}

export function gameShell(ctx) {
  ctx = { copy: civilizationMessages(), ...ctx };
  const {
    state,
    runtimeMode,
    feedback,
    activePanel,
    panel,
    capacity,
    displayState,
    collection,
    readyToClaim,
    resourceDefs,
    format,
    resourceFormat,
    busy,
    copy,
    locale,
    assetResult,
    assetsLoading,
    reducedMotion,
    review,
  } = ctx;
  const spots = BUILDING_IDS.map((id) => buildingSpot(id, ctx)).join("");
  const navigation = tabs(activePanel, copy);
  const collectionStock = collectionResources({
    resourceDefs,
    displayState,
    resourceFormat,
    copy,
    locale,
    assetResult,
  });
  const mobileNavigation = tabs(activePanel, copy, "mobile");
  return `
    <section class="game-shell village-shell ${reducedMotion ? "motion-reduced" : ""}">
      <div data-game-shell-hud></div>
      <main class="command-layout">
        <section class="village-map ${assetFailed(assetResult, CITY_MAPS.desktop) || assetFailed(assetResult, CITY_MAPS.mobile) ? "has-asset-error" : ""}" id="dorf" aria-label="${copy.interactiveMap}" data-asset-container>
          <picture class="village-map-terrain" aria-hidden="true">
            <source media="(max-width: 640px)" srcset="${CITY_MAPS.mobile}">
            <img src="${CITY_MAPS.desktop}" alt="" width="1672" height="941" fetchpriority="high" data-asset-fallback>
          </picture>
          <p class="asset-loading" role="status" ${assetsLoading ? "" : "hidden"}>${copy.assetsLoading}</p>
          <p class="asset-fallback" role="status">${copy.mapAssetUnavailable}</p>
          <div class="map-head">
<p>${copy.villageOf}</p>
<h1>${copy.yourVillage}</h1>
<span>${copy.buildingNames.townhall} ${state.buildings.townhall} · ${copy.buildingNames.warehouse} ${format(capacity)}${runtimeMode === "world" ? copy.mapHead(state.prestigeCount) : ""}</span>
</div>
          <button class="collect-button" id="gather" ${collection.locked || busy ? "disabled" : ""}>
<span data-collection-status>${collection.detail}</span>
<b data-ready-to-claim aria-hidden="true">${collection.locked ? collection.label : `${resourceFormat(readyToClaim)} ${copy.collect}`}</b>
${collectionStock}
<span class="collection-accessibility" data-ready-to-claim-accessible>${collection.locked ? collection.label : `${resourceFormat(readyToClaim)} ${copy.collect}`}</span>
</button>
          <div class="map-buildings">
            ${spots}
            <button class="map-building map-market ${activePanel === "market" ? "is-selected" : ""} ${assetFailed(assetResult, BUILDING_ASSETS.market) ? "has-asset-error" : ""}" data-panel="market" data-map-anchor="bottom-center" style="${mapBuildingAnchorStyle("market")}" aria-label="${copy.openMarket}" data-asset-container>
<img src="${BUILDING_ASSETS.market}" alt="" data-asset-fallback>
<i class="asset-building-fallback" role="status">${copy.buildingAssetUnavailable(copy.buildingNames.market)}</i>
<span>
<b>${copy.buildingNames.market}</b>
<small>${runtimeMode === "world" ? "CGOLD" : copy.marketBadge}</small>
</span>
</button>
          </div>
          <p class="map-feedback" aria-live="polite">${feedbackText(feedback)}</p>
        </section>
        <aside class="command-rail">
<nav class="command-tabs" aria-label="${copy.villageActions}">${navigation}</nav>
<section class="command-panel" id="game-command-panel">${panel}</section>
</aside>
      </main>
      <footer class="game-footer">
<span>
<i>
</i> ${runtimeMode === "world" ? copy.gameAuthority : copy.demoStorage}</span>
<span>${runtimeMode === "demo" ? copy.demoFooter(state.raids) : copy.worldFooter(state.prestigeCount)}</span>
${runtimeMode === "demo" ? `<button id="reset">${copy.demoReset}</button>` : ""}</footer>
      <nav class="mobile-hud" aria-label="${copy.quickAccess}">${mobileNavigation}</nav>
      <div data-game-settings-dialog></div>
      <div data-wallet-review-dialog></div>
    </section>`;
}
