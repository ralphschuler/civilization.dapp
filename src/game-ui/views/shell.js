import { BUILDING_ASSETS, BUILDING_IDS, CITY_MAPS } from "../constants.js";
import { mapBuildingAnchorStyle } from "../map-coordinates.js";
import { escapeHtml } from "../helpers.js";
import { civilizationMessages } from "../../lib/civilization-locale.ts";
// Game feedback can include provider, contract, or contact supplied text.
// Keep this as the sole markup boundary for the imperative game shell.
function feedbackText(feedback) {
  return escapeHtml(feedback);
}

function assetFailed(assetResult, src) {
  return assetResult?.failed.includes(src);
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

export function gameShell(ctx) {
  ctx = { copy: civilizationMessages(), ...ctx };
  const {
    state,
    runtimeMode,
    feedback,
    activePanel,
    panel,
    capacity,
    format,
    copy,
    assetResult,
    assetsLoading,
    reducedMotion,
  } = ctx;
  const spots = BUILDING_IDS.map((id) => buildingSpot(id, ctx)).join("");
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
          <div data-game-collection-status></div>
          <div class="map-buildings">
            ${spots}
            <button class="map-building map-market ${activePanel === "market" ? "is-selected" : ""} ${assetFailed(assetResult, BUILDING_ASSETS.market) ? "has-asset-error" : ""}" data-map-panel="market" data-map-anchor="bottom-center" style="${mapBuildingAnchorStyle("market")}" aria-label="${copy.openMarket}" data-asset-container>
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
<div data-game-command-navigation-mount="desktop"></div>
<section class="command-panel" id="game-command-panel">${panel}</section>
</aside>
      </main>
      <footer class="game-footer">
<span>
<i>
</i> ${runtimeMode === "world" ? copy.gameAuthority : copy.demoStorage}</span>
<span>${runtimeMode === "demo" ? copy.demoFooter(state.raids) : copy.worldFooter(state.prestigeCount)}</span>
${runtimeMode === "demo" ? `<button id="reset">${copy.demoReset}</button>` : ""}</footer>
      <div data-game-command-navigation-mount="mobile"></div>
      <div data-game-settings-dialog></div>
      <div data-wallet-review-dialog></div>
    </section>`;
}
