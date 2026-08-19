import { TROOP_ASSETS } from "../constants.js";
import { costLine, requirementsLine } from "../helpers.js";
import { civilizationMessages } from "../../lib/civilization-locale.ts";

function troopCard({
  id,
  troop,
  state,
  resourceDefs,
  buildings,
  format,
  troopRequirements,
  busy,
  copy,
}) {
  const requirements = troopRequirements(id);
  const affordable = Object.keys(resourceDefs).every(
    (resource) => state.resources[resource] >= troop.cost[resource],
  );
  const details = requirements.length
    ? `<em>${requirementsLine(requirements, buildings)}</em>`
    : `<em>${costLine(troop.cost, resourceDefs, format)}</em>`;
  return `<article class="troop-card ${requirements.length ? "is-locked" : ""}">
<img src="${TROOP_ASSETS[id]}" alt="${troop.label}">
<div>
<b>${troop.label}</b>
<small>${copy.attackAndReady(troop.attack, state.troops[id])}</small>${details}</div>
<button data-train="${id}" ${requirements.length || !affordable || busy ? "disabled" : ""}>+1</button>
</article>`;
}

export function armyPanel(context) {
  context = { copy: civilizationMessages("de-DE"), ...context };
  const { state, troops, copy } = context;
  const cards = Object.entries(troops)
    .map(([id, troop]) => troopCard({ id, troop, ...context }))
    .join("");
  const readyTroops = Object.values(state.troops).reduce(
    (total, amount) => total + amount,
    0,
  );

  return `<div class="inspector army-inspector">
<div class="inspector-title">
<p>${copy.barracksTitle}</p>
<h2>${copy.trainArmy}</h2>
<span>${copy.unitsReady(readyTroops)}</span>
</div>
<div class="troop-list">${cards}</div>
</div>`;
}
