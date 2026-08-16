import { BUILDING_ASSETS, MAX_BUILDING_LEVEL } from "../constants.js";
import { clock, costLine, escapeHtml, requirementsLine } from "../helpers.js";

function pendingConstructionAction({ state, buildings, busy, remainingTime }) {
  const seconds = remainingTime(state.construction.completesAt);
  const building = buildings[state.construction.buildingId];
  const label = building?.label || "Gebäude";
  const actionLabel = seconds ? "Bau läuft" : "Ausbau abschließen";

  return `<div class="requirement-box">
    <span>BAU LÄUFT · ${escapeHtml(label)}</span>
    <b data-construction-countdown>${seconds ? clock(seconds) : "Fertig"}</b>
    <small>Der Contract erhöht die Stufe erst nach Abschluss.</small>
  </div>
  <button class="primary-action" id="complete-upgrade" ${seconds || busy ? "disabled" : ""}>${actionLabel}</button>
  <button class="primary-action" id="boost-construction" ${seconds <= 3_600 || busy ? "disabled" : ""}>1 Stunde für 1 WLD boosten</button>`;
}

function maximumLevelAction(context, building) {
  const { runtimeMode, selectedBuilding, busy, state } = context;
  const canPrestige =
    runtimeMode === "world" && selectedBuilding === "townhall";
  const prestigeAction = canPrestige
    ? `<button class="primary-action" id="prestige" ${busy ? "disabled" : ""}>Prestige ${state.prestigeCount + 1} starten</button>`
    : "";
  const detail =
    selectedBuilding === "townhall"
      ? "Prestige setzt das Dorf zurück und erhöht Produktion dauerhaft um 10 %."
      : "Für dieses Gebäude ist kein weiterer Ausbau möglich.";

  return `<div class="requirement-box">
    <span>MAXIMALSTUFE ERREICHT</span>
    <b>${building.label} ist vollständig ausgebaut.</b>
    <small>${detail}</small>
  </div>${prestigeAction}`;
}

function lockedUpgradeAction(context, requirements) {
  const { buildings, selectedBuilding } = context;

  return `<div class="requirement-box">
    <span>AUSBAU GESPERRT</span>
    <b>${requirementsLine(requirements, buildings)}</b>
    <small>Erfülle diese Stufen, um den Ausbau freizuschalten.</small>
  </div>
  <button class="primary-action" data-building="${selectedBuilding}" disabled>Voraussetzungen erfüllen</button>`;
}

function durationInfo(runtimeMode, duration) {
  if (runtimeMode !== "world") {
    return "";
  }
  if (duration == null) {
    return '<small class="build-duration">On-chain-Bauzeit: wird aus dem Contract geladen …</small>';
  }
  if (duration === false) {
    return '<small class="build-duration">On-chain-Bauzeit: derzeit nicht lesbar</small>';
  }
  return `<small class="build-duration">On-chain-Bauzeit: ${clock(duration)}</small>`;
}

function availableUpgradeAction(context, level, cost) {
  const {
    runtimeMode,
    selectedBuilding,
    busy,
    resourceDefs,
    format,
    buildDuration,
    state,
  } = context;
  const nextLevel = level + 1;
  const duration = buildDuration(selectedBuilding, nextLevel);
  const affordable = Object.keys(resourceDefs).every(
    (id) => state.resources[id] >= cost[id],
  );
  const actionLabel =
    runtimeMode === "world"
      ? `Ausbau auf Stufe ${nextLevel} starten`
      : `Auf Stufe ${nextLevel} ausbauen`;

  return `<div class="upgrade-cost">
    <span>KOSTEN FÜR STUFE ${nextLevel}</span>
    <div>${costLine(cost, resourceDefs, format)}</div>
    ${durationInfo(runtimeMode, duration)}
  </div>
  <button class="primary-action" data-building="${selectedBuilding}" ${!affordable || busy ? "disabled" : ""}>${actionLabel}</button>`;
}

function upgradeAction(context, building, level, requirements, cost) {
  if (level >= MAX_BUILDING_LEVEL) {
    return maximumLevelAction(context, building);
  }
  if (requirements.length) {
    return lockedUpgradeAction(context, requirements);
  }
  return availableUpgradeAction(context, level, cost);
}

function nextProductionLine(context, building) {
  if (!building.produces) {
    return "";
  }

  const rates = context.nextBuildingProduction(context.selectedBuilding);
  const unit = context.runtimeMode === "world" ? "/Tag" : "/s";
  const production = Object.keys(building.produces)
    .map(
      (id) =>
        `+${context.format(rates[id])}${unit} ${context.resourceDefs[id].label}`,
    )
    .join(" · ");

  return ` Nächste Produktion: ${production}.`;
}

export function buildPanel(context) {
  const {
    state,
    selectedBuilding,
    buildings,
    requirements,
    buildingCost,
    runtimeMode,
  } = context;
  const building = buildings[selectedBuilding];
  const level = state.buildings[selectedBuilding];
  const upgradeRequirements = requirements(selectedBuilding);
  const cost = buildingCost(selectedBuilding);
  const action =
    runtimeMode === "world" && state.construction?.pending
      ? pendingConstructionAction(context)
      : upgradeAction(context, building, level, upgradeRequirements, cost);
  const productionLine = nextProductionLine(context, building);

  return `<div class="inspector build-inspector">
    <div class="inspector-art">
      <img src="${BUILDING_ASSETS[selectedBuilding]}" alt="${building.label}">
    </div>
    <div class="inspector-title">
      <p>GEBÄUDEDETAIL</p>
      <h2>${building.label}</h2>
      <span>Stufe ${level} → ${level + 1}</span>
    </div>
    <p class="inspector-copy">${building.detail}${productionLine}</p>
    <div class="inspector-divider"></div>
    ${action}
  </div>`;
}
