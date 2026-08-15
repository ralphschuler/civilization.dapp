import { TROOP_ASSETS } from "../constants.js";
import { costLine, requirementsLine } from "../helpers.js";

function troopCard({
  id,
  troop,
  state,
  resourceDefs,
  buildings,
  format,
  troopRequirements,
  busy,
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
<small>Angriff ${troop.attack} · ${state.troops[id]} bereit</small>${details}</div>
<button data-train="${id}" ${requirements.length || !affordable || busy ? "disabled" : ""}>+1</button>
</article>`;
}

export function armyPanel(context) {
  const { state, troops } = context;
  const cards = Object.entries(troops)
    .map(([id, troop]) => troopCard({ id, troop, ...context }))
    .join("");
  const readyTroops = Object.values(state.troops).reduce(
    (total, amount) => total + amount,
    0,
  );

  return `<div class="inspector army-inspector">
<div class="inspector-title">
<p>KASERNE</p>
<h2>Armee ausbilden</h2>
<span>${readyTroops} Einheiten bereit</span>
</div>
<div class="troop-list">${cards}</div>
</div>`;
}
