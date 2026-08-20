import { BUILDING_ASSETS, MAX_BUILDING_LEVEL } from "../constants.js";
import { clock, costLine, escapeHtml, requirementsLine } from "../helpers.js";
import { boostConstructionStatus } from "../boost-status.js";
import { constructionBoostEligibility } from "../../world-game/boost-eligibility.js";
import { civilizationMessages } from "../../lib/civilization-locale.ts";

function pendingConstructionAction({
  state,
  buildings,
  busy,
  remainingTime,
  copy,
}) {
  const jobs = state.constructions?.length
    ? state.constructions
    : [state.construction];
  return `<section class="construction-jobs" aria-label="${escapeHtml(copy.buildProgress)}" aria-live="polite">
    ${jobs
      .map((construction, index) => {
        const seconds = remainingTime(construction.completesAt);
        const boost = constructionBoostEligibility({
          construction,
          remainingSeconds: seconds,
          busy,
        });
        const building = buildings[construction.buildingId];
        const label = building?.label || copy.buildDetail;
        const slot = construction.slot;
        const suffix = Number.isInteger(slot)
          ? ` data-construction-slot="${slot}"`
          : "";
        const isLegacyFirstSlot =
          slot === 0 || (!Number.isInteger(slot) && index === 0);
        const boostId = isLegacyFirstSlot ? "boost-construction" : "";
        const boostStatusId = isLegacyFirstSlot
          ? "boost-construction-status"
          : `boost-construction-status-${index}`;
        const action = seconds
          ? copy.constructionRunning
          : copy.completeUpgrade;
        return `<div class="requirement-box" data-construction-job${suffix}>
        <span>${copy.buildProgress} ${index + 1}/${jobs.length} · ${escapeHtml(label)}</span>
        <b data-construction-countdown${suffix}>${seconds ? clock(seconds) : copy.complete}</b>
        <small>${copy.constructionNote}</small>
        <button class="primary-action" data-complete-upgrade${suffix} ${seconds || busy ? "disabled" : ""}>${action}</button>
        <button class="primary-action"${boostId ? ` id="${boostId}"` : ""} data-boost-construction${suffix} aria-describedby="${boostStatusId}" ${!boost.eligible ? "disabled" : ""}>${copy.boostConstruction}</button>
        <small id="${boostStatusId}" data-boost-construction-status${suffix}>${boostConstructionStatus(boost.reason, copy)}</small>
      </div>`;
      })
      .join("")}
  </section>`;
}

function maximumLevelAction(context, building) {
  const { runtimeMode, selectedBuilding, busy, state } = context;
  const canPrestige =
    runtimeMode === "world" && selectedBuilding === "townhall";
  const { copy } = context;
  const prestigeAction = canPrestige
    ? `<button class="primary-action" id="prestige" ${busy ? "disabled" : ""}>${copy.prestigeStart(state.prestigeCount + 1)}</button>`
    : "";
  const detail =
    selectedBuilding === "townhall"
      ? copy.prestigeDetail
      : copy.noFurtherUpgrade;

  return `<div class="requirement-box">
    <span>${copy.maxLevel}</span>
    <b>${copy.fullyUpgraded(building.label)}</b>
    <small>${detail}</small>
  </div>${prestigeAction}`;
}

function lockedUpgradeAction(context, requirements) {
  const { buildings, selectedBuilding, copy } = context;

  return `<div class="requirement-box">
    <span>${copy.upgradeLocked}</span>
    <b>${requirementsLine(requirements, buildings)}</b>
    <small>${copy.unlockUpgrade}</small>
  </div>
  <button class="primary-action" data-building="${selectedBuilding}" disabled>${copy.meetRequirements}</button>`;
}

function durationInfo(runtimeMode, duration, copy) {
  if (runtimeMode !== "world") {
    return "";
  }
  if (duration == null) {
    return `<small class="build-duration">${copy.buildDurationLoading}</small>`;
  }
  if (duration === false) {
    return `<small class="build-duration">${copy.buildDurationUnavailable}</small>`;
  }
  return `<small class="build-duration">${copy.buildDuration(clock(duration))}</small>`;
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
    copy,
    constructionAtCapacity = false,
  } = context;
  const nextLevel = level + 1;
  const duration = buildDuration(selectedBuilding, nextLevel);
  const affordable = Object.keys(resourceDefs).every(
    (id) => state.resources[id] >= cost[id],
  );
  const actionLabel =
    runtimeMode === "world"
      ? copy.startWorldUpgrade(nextLevel)
      : copy.startDemoUpgrade(nextLevel);

  return `<div class="upgrade-cost">
    <span>${copy.upgradeCost(nextLevel)}</span>
    <div>${costLine(cost, resourceDefs, format)}</div>
    ${durationInfo(runtimeMode, duration, copy)}
  </div>
  <button class="primary-action" data-building="${selectedBuilding}" ${!affordable || busy || constructionAtCapacity ? "disabled" : ""}>${actionLabel}</button>
  ${constructionAtCapacity ? `<small class="construction-capacity-blocker" role="status">${copy.constructionSlotsOccupied(state.constructionOccupied, state.constructionCapacity)}</small>` : ""}`;
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
  const unit =
    context.runtimeMode === "world"
      ? `/${context.copy.perDay}`
      : `/${context.copy.perSecond}`;
  const production = Object.keys(building.produces)
    .map(
      (id) =>
        `+${context.format(rates[id])}${unit} ${context.resourceDefs[id].label}`,
    )
    .join(" · ");

  return context.copy.nextProduction(production);
}

export function buildPanel(context) {
  context = { copy: civilizationMessages("de-DE"), ...context };
  const {
    state,
    selectedBuilding,
    buildings,
    requirements,
    buildingCost,
    runtimeMode,
    assetResult,
    copy,
  } = context;
  const building = buildings[selectedBuilding];
  const level = state.buildings[selectedBuilding];
  const upgradeRequirements = requirements(selectedBuilding);
  const cost = buildingCost(selectedBuilding);
  const hasConstruction =
    runtimeMode === "world" &&
    (state.constructions?.length || state.construction?.pending);
  const constructionAtCapacity =
    hasConstruction &&
    Number.isInteger(state.constructionOccupied) &&
    Number.isInteger(state.constructionCapacity) &&
    state.constructionOccupied >= state.constructionCapacity;
  const composer = upgradeAction(
    { ...context, constructionAtCapacity },
    building,
    level,
    upgradeRequirements,
    cost,
  );
  const action = hasConstruction
    ? `${pendingConstructionAction(context)}${composer}`
    : composer;
  const productionLine = nextProductionLine(context, building);

  return `<div class="inspector build-inspector">
    <div class="inspector-art ${assetResult?.failed.includes(BUILDING_ASSETS[selectedBuilding]) ? "has-asset-error" : ""}" data-asset-container>
      <img src="${BUILDING_ASSETS[selectedBuilding]}" alt="" data-asset-fallback>
      <i class="asset-building-fallback" role="status">${copy.buildingAssetUnavailable(building.label)}</i>
    </div>
    <div class="inspector-title">
      <p>${copy.buildDetail}</p>
      <h2>${building.label}</h2>
      <span>${copy.level} ${level} → ${level + 1}</span>
    </div>
    <p class="inspector-copy">${building.detail}${productionLine}</p>
    <div class="inspector-divider"></div>
    ${action}
  </div>`;
}
