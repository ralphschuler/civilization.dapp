import {
  BUILDING_ASSETS,
  BUILDING_IDS,
  CITY_MAPS,
  RESOURCE_ASSETS,
} from "../constants.js";
import { compactResourceValue, productionRateText } from "../helpers.js";

export function accessGateView() {
  return `
    <section class="game-access-gate" aria-labelledby="game-access-gate-title">
      <div class="game-access-card">
        <span class="game-access-mark">CD</span>
        <p>WORLD MINI APP</p>
        <h1 id="game-access-gate-title">Anmeldung erforderlich</h1>
        <span>Der Zugang wird von der World-App-Vorschaltseite bestätigt.</span>
      </div>
    </section>`;
}

export function runtimeGateView({ loading, feedback, escapeHtml }) {
  const title = loading
    ? "World Chain wird geladen"
    : "On-chain-Spielstand nicht verfügbar";
  const retry = loading
    ? ""
    : '<button class="game-access-action" id="retry-world-state">Erneut prüfen</button>';
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
}) {
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
    ? `<span>Wallet-Guthaben: ${exactValue(stored)}.</span>`
    : `<span role="progressbar" aria-label="${definition.label}-Speicher" aria-valuemin="0" aria-valuemax="${storageCapacity}" aria-valuenow="${stored}" aria-valuetext="${exactValue(stored)} von ${exactValue(storageCapacity)}"></span>`;
  return `
    <div class="resource ${definition.color}" data-resource="${id}" role="group" aria-label="${definition.label}">
      <img src="${RESOURCE_ASSETS[id]}" alt="" aria-hidden="true">
      <span class="resource-values" aria-hidden="true">
        <small>${gold ? "CGOLD" : tokens[id].symbol} · ${gold ? "WALLET" : "SPEICHER"}</small>
        <strong data-resource-value>${compactValue(stored)}</strong>
        ${capacityMarkup}
      </span>
      <em class="resource-production" data-resource-production aria-hidden="true" ${hasProduction ? "" : "hidden"}><span class="resource-production-label">Produktion </span><span data-resource-production-value>${productionText}</span></em>
      <span class="resource-accessibility">
        ${accessibleStorageMarkup}
        <span data-resource-accessible-production ${hasProduction ? "" : "hidden"}>${hasProduction ? `Produktion: ${accessibleProductionText}` : ""}</span>
      </span>
    </div>`;
}

function collectionResources({ resourceDefs, displayState, resourceFormat }) {
  const resources = Object.entries(resourceDefs).map(([id, definition]) => {
    const value = Number.isFinite(displayState.unclaimed?.[id])
      ? displayState.unclaimed[id]
      : 0;
    return { id, label: definition.label, value };
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
      Feldressourcen: ${resources
        .map(
          ({ id, label, value }) =>
            `${label} <span data-collection-resource-accessible="${id}">${resourceFormat(value)}</span>`,
        )
        .join("; ")}.
    </span>`;
}

function buildingSpot(id, ctx) {
  const { buildings, state, selectedBuilding, activePanel } = ctx;
  return `
    <button class="map-building map-${id} ${selectedBuilding === id && activePanel === "build" ? "is-selected" : ""}"
      data-map-building="${id}" aria-label="${buildings[id].label}, Level ${state.buildings[id]}">
      <img src="${BUILDING_ASSETS[id]}" alt="">
      <span>
<b>${buildings[id].label}</b>
<small>LVL ${state.buildings[id]}</small>
</span>
    </button>`;
}

function tabs(activePanel) {
  return [
    ["build", "Bauplan"],
    ["army", "Kaserne"],
    ["market", "Markt"],
    ["raid", "Überfall"],
  ]
    .map(
      ([id, label]) =>
        `<button data-panel="${id}" class="${activePanel === id ? "is-active" : ""}">${label}</button>`,
    )
    .join("");
}

export function gameShell(ctx) {
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
      }),
    )
    .join("");
  const spots = BUILDING_IDS.map((id) => buildingSpot(id, ctx)).join("");
  const navigation = tabs(activePanel);
  const collectionStock = collectionResources({
    resourceDefs,
    displayState,
    resourceFormat,
  });
  const mobileNavigation = navigation
    .replaceAll("Bauplan", "Bau")
    .replaceAll("Kaserne", "Armee");
  return `
    <section class="game-shell village-shell" style="--city-map-desktop:url('${CITY_MAPS.desktop}');--city-map-mobile:url('${CITY_MAPS.mobile}')">
      <header class="hud village-hud">
        <div class="game-mark">
<span>CD</span>
<div>
<b>CIVILIZATION</b>
<small>DAPP · DORF VON MINTIA</small>
</div>
</div>
        <div class="resource-hud">${hud}</div>
        <span class="demo-badge ${worldApp.installed ? "is-world" : ""}">${worldBadge}</span>
      </header>
      <main class="command-layout">
        <section class="village-map" id="dorf" aria-label="Interaktive Stadtkarte von Mintia. Wähle ein Gebäude, um seinen Ausbau zu planen.">
          <div class="map-head">
<p>DORF VON MINTIA</p>
<h1>Dein Dorf.</h1>
<span>Rathaus ${state.buildings.townhall} · Speicher ${format(capacity)}${runtimeMode === "world" ? ` · Prestige ${state.prestigeCount}` : ""}</span>
</div>
          <button class="collect-button" id="gather" ${collection.locked || busy ? "disabled" : ""}>
<span data-collection-status>${collection.detail}</span>
<b data-ready-to-claim aria-hidden="true">${collection.locked ? collection.label : `${resourceFormat(readyToClaim)} sammeln`}</b>
${collectionStock}
<span class="collection-accessibility" data-ready-to-claim-accessible>${collection.locked ? collection.label : `${resourceFormat(readyToClaim)} sammeln`}</span>
</button>
          <div class="map-buildings">
            ${spots}
            <button class="map-building map-market ${activePanel === "market" ? "is-selected" : ""}" data-panel="market" aria-label="Tauschhalle öffnen">
<img src="${BUILDING_ASSETS.market}" alt="">
<span>
<b>Tauschhalle</b>
<small>${runtimeMode === "world" ? "CGOLD" : "Demo-Markt"}</small>
</span>
</button>
          </div>
          <p class="map-feedback" aria-live="polite">${feedback}</p>
        </section>
        <aside class="command-rail">
<nav class="command-tabs" aria-label="Dorfaktionen">${navigation}</nav>
<section class="command-panel">${panel}</section>
</aside>
      </main>
      <footer class="game-footer">
<span>
<i>
</i> ${runtimeMode === "world" ? "CivilizationGame ist alleinige Spielautorität" : "Demo-Speicher · nur lokal"}</span>
<span>${runtimeMode === "demo" ? `${state.raids} Demo-Überfälle · Kein Wallet verbunden` : `Prestige ${state.prestigeCount} · World Chain`}</span>
${runtimeMode === "demo" ? '<button id="reset">Demo zurücksetzen</button>' : ""}</footer>
      <nav class="mobile-hud" aria-label="Schnellzugriff">${mobileNavigation}</nav>
    </section>`;
}
