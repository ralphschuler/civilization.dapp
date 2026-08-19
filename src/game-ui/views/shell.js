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

function assetFailed(assetResult, src) {
  return assetResult?.failed.includes(src);
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
  assetResult,
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
    <div class="resource ${definition.color} ${assetFailed(assetResult, RESOURCE_ASSETS[id]) ? "has-asset-error" : ""}" data-resource="${id}" data-asset-container role="group" aria-label="${label}">
      <img src="${RESOURCE_ASSETS[id]}" alt="" aria-hidden="true" data-asset-fallback>
      <span class="asset-icon-fallback" role="status">${copy.resourceAssetUnavailable(label)}</span>
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
  assetResult,
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

function settingsDialog({
  copy,
  locale,
  walletAddress,
  settingsOpen,
  reducedMotion,
}) {
  if (!settingsOpen) return "";
  return `
    <div class="settings-backdrop" data-close-settings aria-hidden="true"></div>
    <section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" aria-describedby="settings-feedback">
      <header class="settings-dialog__header">
        <h2 id="settings-title">${copy.settingsTitle}</h2>
        <button type="button" class="settings-dialog__close" data-close-settings aria-label="${copy.settingsClose}">×</button>
      </header>
      <div class="settings-dialog__body">
        <section aria-labelledby="settings-language-title">
          <h3 id="settings-language-title">${copy.language}</h3>
          <label class="settings-field" for="civilization-locale">
            <span>${copy.language}</span>
            <select id="civilization-locale">
              <option value="de-DE" ${locale === "de-DE" ? "selected" : ""}>${copy.german}</option>
              <option value="en-US" ${locale === "en-US" ? "selected" : ""}>${copy.english}</option>
            </select>
          </label>
        </section>
        <section aria-labelledby="settings-account-title">
          <h3 id="settings-account-title">${copy.account}</h3>
          <p class="settings-wallet-label">${copy.connectedWallet}</p>
          <code class="settings-wallet-address">${walletAddress || "—"}</code>
          <button type="button" class="settings-secondary-action" data-copy-wallet>${copy.copyAddress}</button>
        </section>
        <section aria-labelledby="settings-motion-title">
          <h3 id="settings-motion-title">${copy.motion}</h3>
          <label class="settings-toggle">
            <input type="checkbox" data-reduced-motion ${reducedMotion ? "checked" : ""}>
            <span>${copy.motionDescription}</span>
          </label>
        </section>
        <section aria-labelledby="settings-session-title">
          <h3 id="settings-session-title">${copy.session}</h3>
          <button type="button" class="settings-logout" data-logout>${copy.logout}</button>
        </section>
        <p id="settings-feedback" class="settings-feedback" role="status" aria-live="polite" data-copy-success="${copy.addressCopied}" data-copy-failure="${copy.addressCopyFailed}" data-logout-failure="${copy.logoutFailed}"></p>
      </div>
    </section>`;
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
    assetResult,
    assetsLoading,
    walletAddress,
    settingsOpen,
    reducedMotion,
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
        assetResult,
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
    assetResult,
  });
  const mobileNavigation = navigation
    .replaceAll(copy.build, copy.buildShort)
    .replaceAll(copy.army, copy.armyShort);
  return `
    <section class="game-shell village-shell ${reducedMotion ? "motion-reduced" : ""}">
      <header class="hud village-hud">
        <div class="game-mark">
<span>CD</span>
<div>
<b>CIVILIZATION</b>
<small>DAPP · ${copy.villageOf}</small>
</div>
</div>
        <div class="resource-hud">${hud}</div>
        <button type="button" class="resource-settings" data-open-settings aria-haspopup="dialog" aria-label="${copy.settings}">⚙ <span>${copy.settings}</span></button>
        <span class="demo-badge ${worldApp.installed ? "is-world" : ""}">${worldBadge}</span>
      </header>
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
            <button class="map-building map-market ${activePanel === "market" ? "is-selected" : ""} ${assetFailed(assetResult, BUILDING_ASSETS.market) ? "has-asset-error" : ""}" data-panel="market" data-map-anchor="bottom-center" style="${mapBuildingAnchorStyle("market")}" aria-label="${copy.openMarket}" data-asset-container>
<img src="${BUILDING_ASSETS.market}" alt="" data-asset-fallback>
<i class="asset-building-fallback" role="status">${copy.buildingAssetUnavailable(copy.buildingNames.market)}</i>
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
      ${settingsDialog({ copy, locale, walletAddress, settingsOpen, reducedMotion })}
    </section>`;
}
