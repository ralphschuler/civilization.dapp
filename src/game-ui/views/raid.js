import { clock, costLine, escapeHtml } from "../helpers.js";
import { civilizationMessages } from "../../lib/civilization-locale.ts";

function raidReport({
  state,
  troops,
  resourceDefs,
  format,
  runtimeMode,
  copy,
}) {
  if (!state.lastRaid) {
    const targetDescription =
      runtimeMode === "world" ? copy.worldRaidTarget : copy.demoRaidTarget;

    return `<div class="raid-result">
      <span>${copy.lastReport}</span>
      <b>${copy.noTroopsSent}</b>
      <small>${copy.chooseRaidTarget(targetDescription)}</small>
    </div>`;
  }

  const result = state.lastRaid;
  const losses =
    Object.entries(result.casualties)
      .filter(([, amount]) => amount)
      .map(([id, amount]) => `${amount} ${troops[id].label}`)
      .join(", ") || copy.noLosses;
  const resultClass = result.ok ? "success" : "failure";
  const resultLabel = result.ok ? copy.victory : copy.retreat;
  const loot = costLine(result.stolen, resourceDefs, format) || copy.noLoot;

  return `<div class="raid-result ${resultClass}">
    <span>LETZTER BERICHT · ${resultLabel}</span>
    <b>${escapeHtml(result.target)}: ${copy.attackAgainst(result.attack, result.defense)}</b>
    <small>${copy.raidSummary(loot, losses)}</small>
  </div>`;
}

function armyInputs(state, troops, copy) {
  return Object.entries(troops)
    .map(
      ([id, troop]) => `<label>
      <span>${troop.label}<b>${copy.troopsReady(state.troops[id])}</b></span>
      <input type="number" min="0" max="${state.troops[id]}" value="0" id="raid-${id}" inputmode="numeric">
    </label>`,
    )
    .join("");
}

function pendingTargetName(state, runtimeMode, copy) {
  if (runtimeMode === "demo") {
    const target = state.targets.find(
      (item) => item.id === state.pendingRaid.targetId,
    );
    return target?.name || copy.targetLocation;
  }
  if (runtimeMode === "world") {
    const targetId = state.pendingRaid.targetId;
    return `${targetId.slice(0, 6)}…${targetId.slice(-4)}`;
  }
  return copy.targetLocation;
}

function pendingRaidPanel(context) {
  const { state, runtimeMode, busy, remainingTime, copy } = context;
  const seconds = remainingTime(state.pendingRaid.arrivesAt);
  const targetName = pendingTargetName(state, runtimeMode, copy);
  const worldResolutionNote = copy.resolveWorldRaid;
  const demoResolutionNote = copy.resolveDemoRaid;
  const resolutionNote =
    runtimeMode === "world" ? worldResolutionNote : demoResolutionNote;
  const action =
    runtimeMode === "world"
      ? `<button class="primary-action" id="resolve-raid" ${seconds || busy ? "disabled" : ""}>${seconds ? copy.constructionRunning : copy.resolveBattle}</button>`
      : `<button class="primary-action" disabled>${copy.constructionRunning}</button>`;

  return `<div class="inspector raid-inspector">
    <div class="inspector-title">
      <p>${copy.raidTitle}</p>
      <h2>${copy.marchEnRoute}</h2>
      <span>${copy.noFurtherMarch}</span>
    </div>
    <div class="march-status">
      <span>${copy.marchTo(escapeHtml(targetName.toUpperCase()))}</span>
      <b data-raid-countdown>${clock(seconds)}</b>
      <small>${resolutionNote}</small>
    </div>
    ${action}
    ${raidReport(context)}
  </div>`;
}

function selectedContact(selectedOpponent, copy) {
  if (!selectedOpponent) {
    return "";
  }

  return `<div class="requirement-box">
    <span>${copy.selectedContact}</span>
    <b>${escapeHtml(selectedOpponent.username)}</b>
    <small>${escapeHtml(selectedOpponent.address)}</small>
  </div>`;
}

function worldRaidPanel(context) {
  const { state, troops, busy, selectedOpponent, copy } = context;
  const selectedContactMarkup = selectedContact(selectedOpponent, copy);

  return `<div class="inspector raid-inspector">
    <div class="inspector-title">
      <p>${copy.raidTitle}</p>
      <h2>${copy.planMarch}</h2>
      <span>${copy.worldRaidDescription}</span>
    </div>
    ${selectedContactMarkup}
    <button class="primary-action" id="pick-raid-contact" ${busy ? "disabled" : ""}>${copy.chooseWorldContact}</button>
    <label class="target-select">
      ${copy.orWalletAddress}
      <input id="raid-target-address" type="text" value="${escapeHtml(selectedOpponent?.address || "")}" placeholder="0x…" autocomplete="off">
    </label>
    <div class="army-inputs">${armyInputs(state, troops, copy)}</div>
    <button class="primary-action" id="send-raid" ${busy ? "disabled" : ""}>${copy.startMarch}</button>
    ${raidReport(context)}
  </div>`;
}

function demoTargetOptions(state, format, copy) {
  return state.targets
    .map((target) => {
      const fieldStock = Object.values(target.unclaimed).reduce(
        (total, amount) => total + amount,
        0,
      );
      return `<option value="${target.id}">${escapeHtml(target.name)} · ${copy.targetOption(target.defense, format(fieldStock))}</option>`;
    })
    .join("");
}

function demoRaidPanel(context) {
  const { state, troops, format, copy } = context;
  const options = demoTargetOptions(state, format, copy);
  const isUnavailable = state.targets.length === 0;

  return `<div class="inspector raid-inspector">
    <div class="inspector-title">
      <p>${copy.raidTitle}</p>
      <h2>${copy.planMarch}</h2>
      <span>${copy.demoRaidDescription}</span>
    </div>
    <label class="target-select">
      ${copy.targetLocation}
      <select id="raid-target" ${isUnavailable ? "disabled" : ""}>${options || `<option>${copy.noDemoVillages}</option>`}</select>
    </label>
    <div class="army-inputs">${armyInputs(state, troops, copy)}</div>
    <button class="primary-action" id="send-raid" ${isUnavailable ? "disabled" : ""}>${copy.startMarch}</button>
    ${raidReport(context)}
  </div>`;
}

export function raidPanel(context) {
  context = { copy: civilizationMessages("de-DE"), ...context };
  if (context.state.pendingRaid) {
    return pendingRaidPanel(context);
  }
  if (context.runtimeMode === "world") {
    return worldRaidPanel(context);
  }
  return demoRaidPanel(context);
}
