import {
  BUILDING_ASSETS,
  BUILDING_IDS,
  CITY_MAPS,
  RESOURCE_ASSETS,
} from "../constants.js";
import { mapBuildingAnchorStyle } from "../map-coordinates.js";
import { compactResourceValue, productionRateText } from "../helpers.js";
import { civilizationMessages } from "../../lib/civilization-locale.ts";

export function accessGateView(copy = civilizationMessages()) {
  return `
    <section class="game-access-gate" aria-labelledby="game-access-gate-title">
      <div class="game-access-card">
        <span class="game-access-mark">CD</span>
        <p>WORLD MINI APP</p>
        <h1 id="game-access-gate-title">${copy.accessRequired}</h1>
        <span>${copy.accessDetail}</span>
      </div>
    </section>`;
}

export function runtimeGateView({
  loading,
  feedback,
  escapeHtml,
  copy = civilizationMessages(),
}) {
  const title = loading ? copy.loadingWorld : copy.worldUnavailable;
  const retry = loading
    ? ""
    : `<button class="game-access-action" id="retry-world-state">${copy.retry}</button>`;
  return `
    <section class="game-access-gate" aria-labelledby="world-runtime-title">
      <div class="game-access-card">
        <span class="game-access-mark">CD</span>
        <p>WORLD CHAIN</p>
        <h1 id="world-runtime-title">${title}</h1>
        <span>${escapeHtml(feedback)}</span>
        ${retry}
      </div>
    </section>`;
}

function resourceHudItem({
  id,
  definition,
  state,
  runtimeMode,
  tokens,
  capacity,
  production,
  resourceFormat,
  copy,
}) {
  const label = copy.resourceNames[id] || definition.label;
  const exactValue = (amount) =>
    Number.isFinite(amount) ? resourceFormat(amount) : resourceFormat(0);
  const compactValue = (amount) => compactResourceValue(amount, resourceFormat);
  const stored = Number.isFinite(state.resources[id]) ? state.resources[id] : 0;
  const storageCapacity = Number.isFinite(capacity) ? capacity : 0;
  const productionText = productionRateText({
    resourceId: id,
    rate: production?.[id],
    mode: runtimeMode,
    formatValue: compactValue,
  });
  const accessibleProductionText = productionRateText({
    resourceId: id,
    rate: production?.[id],
    mode: runtimeMode,
    formatValue: exactValue,
  });
  const hasProduction = productionText !== "";
  const gold = runtimeMode === "world" && id === "gold";
  const capacityMarkup = gold
    ? ""
    : `
    <b class="storage-capacity" data-resource-capacity>/${compactValue(storageCapacity)}</b>
    <div class="storage-progress ${stored >= storageCapacity ? "is-full" : ""}">
      <i data-resource-progress style="transform:scaleX(${storageCapacity ? Math.min(1, stored / storageCapacity) : 0})">
</i>
    </div>`;
  const accessibleStorageMarkup = gold
    ? `<span>${copy.walletBalance}: ${exactValue(stored)}.</span>`
    : `<span role="progressbar" aria-label="${label}-${copy.storageAccessible}" aria-valuemin="0" aria-valuemax="${storageCapacity}" aria-valuenow="${stored}" aria-valuetext="${exactValue(stored)} ${copy.from} ${exactValue(storageCapacity)}"></span>`;
  return `
    <div class="resource ${definition.color}" data-resource="${id}" role="group" aria-label="${label}">
      <img src="${RESOURCE_ASSETS[id]}" alt="" aria-hidden="true">
      <span class="resource-values" aria-hidden="true">
        <small>${gold ? "CGOLD" : tokens[id].symbol} · ${gold ? copy.wallet : copy.storage}</small>
        <strong data-resource-value>${compactValue(stored)}</strong>
        ${capacityMarkup}
      </span>
      <em class="resource-production" data-resource-production aria-hidden="true" ${hasProduction ? "" : "hidden"}><span class="resource-production-label">${copy.production} </span><span data-resource-production-value>${productionText}</span></em>
      <span class="resource-accessibility">
        ${accessibleStorageMarkup}
        <span data-resource-accessible-production ${hasProduction ? "" : "hidden"}>${hasProduction ? `${copy.production}: ${accessibleProductionText}` : ""}</span>
      </span>
    </div>`;
}

function collectionResources({
  resourceDefs,
  displayState,
  resourceFormat,
  copy,
}) {
  const resources = Object.entries(resourceDefs).map(([id, definition]) => {
    const value = Number.isFinite(displayState.unclaimed?.[id])
      ? displayState.unclaimed[id]
      : 0;
    return { id, label: copy.resourceNames[id] || definition.label, value };
  });
  const compactValue = (value) => compactResourceValue(value, resourceFormat);
  return `
    <span class="collection-resources" aria-hidden="true">
      ${resources
        .map(
          ({ id, value }) => `
            <span class="collection-resource" data-collection-resource="${id}">
              <img src="${RESOURCE_ASSETS[id]}" alt="" aria-hidden="true">
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
  const { buildings, state, selectedBuilding, activePanel, copy } = ctx;
  const label = copy.buildingNames[id] || buildings[id].label;
  return `
    <button class="map-building map-${id} ${selectedBuilding === id && activePanel === "build" ? "is-selected" : ""}"
      data-map-building="${id}" data-map-anchor="bottom-center" style="${mapBuildingAnchorStyle(id)}" aria-label="${label}, ${copy.level} ${state.buildings[id]}">
      <img src="${BUILDING_ASSETS[id]}" alt="">
      <span>
<b>${label}</b>
<small>LVL ${state.buildings[id]}</small>
</span>
    </button>`;
}

function tabs(activePanel, copy) {
  return [
    ["build", copy.build],
    ["army", copy.army],
    ["market", copy.market],
    ["raid", copy.raid],
  ]
    .map(
      ([id, label]) =>
        `<button data-panel="${id}" class="${activePanel === id ? "is-active" : ""}">${label}</button>`,
    )
    .join("");
}

export function gameShell(ctx) {
  ctx = { copy: civilizationMessages(), ...ctx };
  const {
    state,
    runtimeMode,
    worldApp,
    worldBadge,
    feedback,
    activePanel,
    panel,
    production,
    capacity,
    displayState,
    collection,
    readyToClaim,
    resourceDefs,
    tokens,
    format,
    resourceFormat,
    busy,
    copy,
    locale,
  } = ctx;
  const hud = Object.entries(resourceDefs)
    .map(([id, definition]) =>
      resourceHudItem({
        id,
        definition,
        state,
        runtimeMode,
        tokens,
        capacity,
        production,
        resourceFormat,
        copy,
      }),
    )
    .join("");
  const spots = BUILDING_IDS.map((id) => buildingSpot(id, ctx)).join("");
  const navigation = tabs(activePanel, copy);
  const collectionStock = collectionResources({
    resourceDefs,
    displayState,
    resourceFormat,
    copy,
  });
  const mobileNavigation = navigation
    .replaceAll(copy.build, copy.buildShort)
    .replaceAll(copy.army, copy.armyShort);
  return `
    <section class="game-shell village-shell" style="--city-map-desktop:url('${CITY_MAPS.desktop}');--city-map-mobile:url('${CITY_MAPS.mobile}')">
      <header class="hud village-hud">
        <div class="game-mark">
<span>CD</span>
<div>
<b>CIVILIZATION</b>
<small>DAPP · ${copy.villageOf}</small>
</div>
</div>
        <div class="resource-hud">${hud}</div>
        <span class="demo-badge ${worldApp.installed ? "is-world" : ""}">${worldBadge}</span>
        <label class="game-locale"><span class="sr-only">${copy.language}</span><select id="civilization-locale" aria-label="${copy.language}"><option value="de-DE" ${locale === "de-DE" ? "selected" : ""}>${copy.german}</option><option value="en-US" ${locale === "en-US" ? "selected" : ""}>${copy.english}</option></select></label>
      </header>
      <main class="command-layout">
        <section class="village-map" id="dorf" aria-label="${copy.interactiveMap}">
          <div class="map-head">
<p>${copy.villageOf}</p>
<h1>${copy.yourVillage}</h1>
<span>${copy.buildingNames.townhall} ${state.buildings.townhall} · ${copy.buildingNames.warehouse} ${format(capacity)}${runtimeMode === "world" ? ` · Prestige ${state.prestigeCount}` : ""}</span>
</div>
          <button class="collect-button" id="gather" ${collection.locked || busy ? "disabled" : ""}>
<span data-collection-status>${collection.detail}</span>
<b data-ready-to-claim aria-hidden="true">${collection.locked ? collection.label : `${resourceFormat(readyToClaim)} ${copy.collect}`}</b>
${collectionStock}
<span class="collection-accessibility" data-ready-to-claim-accessible>${collection.locked ? collection.label : `${resourceFormat(readyToClaim)} ${copy.collect}`}</span>
</button>
          <div class="map-buildings">
            ${spots}
            <button class="map-building map-market ${activePanel === "market" ? "is-selected" : ""}" data-panel="market" data-map-anchor="bottom-center" style="${mapBuildingAnchorStyle("market")}" aria-label="${copy.openMarket}">
<img src="${BUILDING_ASSETS.market}" alt="">
<span>
<b>${copy.buildingNames.market}</b>
<small>${runtimeMode === "world" ? "CGOLD" : "Demo-Markt"}</small>
</span>
</button>
          </div>
          <p class="map-feedback" aria-live="polite">${feedback}</p>
        </section>
        <aside class="command-rail">
<nav class="command-tabs" aria-label="${copy.villageActions}">${navigation}</nav>
<section class="command-panel">${panel}</section>
</aside>
      </main>
      <footer class="game-footer">
<span>
<i>
</i> ${runtimeMode === "world" ? copy.gameAuthority : copy.demoStorage}</span>
<span>${runtimeMode === "demo" ? `${state.raids} Demo-Überfälle · Kein Wallet verbunden` : `Prestige ${state.prestigeCount} · World Chain`}</span>
${runtimeMode === "demo" ? `<button id="reset">${copy.demoReset}</button>` : ""}</footer>
      <nav class="mobile-hud" aria-label="${copy.quickAccess}">${mobileNavigation}</nav>
    </section>`;
}
