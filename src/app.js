import "./styles.css";
import {
  BUILDINGS,
  RESOURCE_DEFS,
  TOKEN_REGISTRY,
  TROOPS,
  createInitialState,
  format,
  gather,
  getBuildingCost,
  getCapacity,
  getProduction,
  getRequirements,
  resolveRaidMarch,
  settle,
  startGathering,
  startRaidMarch,
  swapInternal,
  trainTroop,
  upgradeBuilding,
} from "./game.js";

const STORAGE_KEY = "idlemint-village-demo-v1";
const asset = (path) => `${import.meta.env.BASE_URL}assets/${path}`;
const BUILDING_ASSETS = {
  townhall: asset("buildings/town-hall.png"), timber: asset("buildings/wood-cutter.png"), claypit: asset("buildings/clay-pit.png"),
  quarry: asset("buildings/iron-mine.png"), warehouse: asset("buildings/storage.png"), workshop: asset("buildings/house.png"),
  goldmine: asset("buildings/iron-mine.png"), barracks: asset("buildings/barracks.png"), market: asset("buildings/market.png"),
};
const RESOURCE_ASSETS = { wood: asset("resources/wood.png"), clay: asset("resources/clay.png"), stone: asset("resources/iron.png"), gold: asset("resources/gold.png") };
const TROOP_ASSETS = { spear: asset("units/spearman.png"), archer: asset("units/archer.png"), rider: asset("units/knight.png") };
const CITY_MAPS = { desktop: asset("maps/mintia-village-map-v1.png"), mobile: asset("maps/mintia-village-map-mobile-v1.png") };
const BUILDING_IDS = ["townhall", "timber", "claypit", "quarry", "warehouse", "workshop", "goldmine", "barracks"];
let feedback = "Wähle ein Gebäude auf dem Dorfplan.";
let selectedBuilding = "townhall";
let activePanel = "build";
let state = load();

function load() {
  const initial = createInitialState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved?.resources || !saved?.buildings || !saved?.troops) return initial;
    const targets = (saved.targets || initial.targets).map((target) => ({
      ...target,
      unclaimed: { ...initial.unclaimed, ...(target.unclaimed || target.loot || {}) },
      initialUnclaimed: { ...initial.unclaimed, ...(target.initialUnclaimed || target.initialLoot || target.unclaimed || target.loot || {}) },
    }));
    return { ...initial, ...saved, resources: { ...initial.resources, ...saved.resources }, unclaimed: { ...initial.unclaimed, ...saved.unclaimed }, buildings: { ...initial.buildings, ...saved.buildings }, troops: { ...initial.troops, ...saved.troops }, targets };
  } catch { return initial; }
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function remainingTime(until) { return Math.max(0, Math.ceil((until - Date.now()) / 1000)); }
function clock(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function collectionStatus() {
  const seconds = remainingTime(state.gatherAvailableAt || 0);
  return seconds ? { locked: true, label: `Sammeln in ${clock(seconds)}`, detail: `SAMMLER KEHREN IN ${clock(seconds)} ZURÜCK` } : { locked: false, detail: "FELDLAGER · RAIDBAR" };
}

function costLine(value) {
  return Object.entries(RESOURCE_DEFS).filter(([resource]) => value[resource] > 0).map(([resource, definition]) => `<span class="cost ${definition.color}">${format(value[resource])} ${definition.short}</span>`).join("");
}

function requirementsLine(requirements) { return requirements.map(({ id, level }) => `${BUILDINGS[id].label} ${level}`).join(" · "); }

function buildingSpot(id) {
  const building = BUILDINGS[id];
  const level = state.buildings[id];
  return `<button class="map-building map-${id} ${selectedBuilding === id && activePanel === "build" ? "is-selected" : ""}" data-map-building="${id}" aria-label="${building.label}, Level ${level}"><img src="${BUILDING_ASSETS[id]}" alt=""><span><b>${building.label}</b><small>LVL ${level}</small></span></button>`;
}

function buildInspector() {
  const building = BUILDINGS[selectedBuilding];
  const level = state.buildings[selectedBuilding];
  const requirements = getRequirements(state, selectedBuilding);
  const required = getBuildingCost(state, selectedBuilding);
  const affordable = Object.keys(RESOURCE_DEFS).every((resource) => state.resources[resource] >= required[resource]);
  const production = Object.entries(building.produces || {}).map(([resource, rate]) => `+${format(rate * (level + 1))}/s ${RESOURCE_DEFS[resource].label}`).join(" · ");
  return `<div class="inspector build-inspector"><div class="inspector-art"><img src="${BUILDING_ASSETS[selectedBuilding]}" alt="${building.label}"></div><div class="inspector-title"><p>GEBÄUDEDETAIL</p><h2>${building.label}</h2><span>Stufe ${level} → ${level + 1}</span></div><p class="inspector-copy">${building.detail}${production ? ` Nächste Produktion: ${production}.` : ""}</p><div class="inspector-divider"></div>${requirements.length ? `<div class="requirement-box"><span>AUSBAU GESPERRT</span><b>${requirementsLine(requirements)}</b><small>Erfülle diese Stufen, um den Ausbau freizuschalten.</small></div>` : `<div class="upgrade-cost"><span>KOSTEN FÜR STUFE ${level + 1}</span><div>${costLine(required)}</div></div>`}<button class="primary-action" data-building="${selectedBuilding}" ${requirements.length || !affordable ? "disabled" : ""}>${requirements.length ? "Voraussetzungen erfüllen" : `Auf Stufe ${level + 1} ausbauen`}</button></div>`;
}

function troopCard(id) {
  const troop = TROOPS[id];
  const requirements = troop.requires.filter(({ id: required, level }) => state.buildings[required] < level);
  const affordable = Object.keys(RESOURCE_DEFS).every((resource) => state.resources[resource] >= troop.cost[resource]);
  return `<article class="troop-card ${requirements.length ? "is-locked" : ""}"><img src="${TROOP_ASSETS[id]}" alt="${troop.label}"><div><b>${troop.label}</b><small>Angriff ${troop.attack} · ${state.troops[id]} bereit</small>${requirements.length ? `<em>${requirementsLine(requirements)}</em>` : `<em>${costLine(troop.cost)}</em>`}</div><button data-train="${id}" ${requirements.length || !affordable ? "disabled" : ""}>+1</button></article>`;
}

function armyPanel() { return `<div class="inspector army-inspector"><div class="inspector-title"><p>KASERNE</p><h2>Armee ausbilden</h2><span>${Object.values(state.troops).reduce((sum, amount) => sum + amount, 0)} Einheiten bereit</span></div><div class="troop-list">${Object.keys(TROOPS).map(troopCard).join("")}</div></div>`; }

function tokenRows() {
  return Object.entries(TOKEN_REGISTRY).map(([resource, token]) => `<div class="token-row ${token.externalSettlement ? "token-gold" : ""}"><img src="${RESOURCE_ASSETS[resource]}" alt=""><span><b>${token.name} · ${token.symbol}</b><small>${token.externalSettlement ? `Gold-Paare: ${token.pairs.join(" / ")}` : "ERC-20 · In-Game-Markt"}</small></span><em>${token.externalSettlement ? "SETTLEMENT" : "IN-GAME"}</em></div>`).join("");
}

function marketPanel() {
  return `<div class="inspector market-inspector"><div class="inspector-title"><p>TAUSCHHALLE</p><h2>Rohstoffe handeln</h2><span>Spielinterne ERC-20-Transfers</span></div><div class="token-registry">${tokenRows()}</div><div class="market-controls"><label>Von<select id="market-from"><option value="wood">Holz · IMW</option><option value="clay">Lehm · IMC</option><option value="stone">Stein · IMS</option></select></label><label>Zu<select id="market-to"><option value="clay">Lehm · IMC</option><option value="wood">Holz · IMW</option><option value="stone">Stein · IMS</option></select></label><label>Menge<input id="market-amount" type="number" min="1" value="25" inputmode="numeric"></label></div><button class="primary-action" id="market-swap">Im Spiel tauschen</button><div class="gold-boundary"><span>GOLD-SETTLEMENT</span><b>IMG ist einzige externe Brücke.</b><small>WLD / WBTC erst nach Audit, Liquidität und World-App-Allowlisting.</small><button disabled>Gold gegen WLD oder WBTC tauschen</button></div></div>`;
}

function raidResult() {
  if (!state.lastRaid) return `<div class="raid-result"><span>LETZTER BERICHT</span><b>Noch keine Truppen entsandt.</b><small>Wähle ein Demo-Dorf und deine Marschgruppe.</small></div>`;
  const result = state.lastRaid;
  const stolen = costLine(result.stolen) || "Keine Beute";
  const losses = Object.entries(result.casualties).filter(([, amount]) => amount).map(([id, amount]) => `${amount} ${TROOPS[id].label}`).join(", ") || "Keine Verluste";
  return `<div class="raid-result ${result.ok ? "success" : "failure"}"><span>LETZTER BERICHT · ${result.ok ? "SIEG" : "RÜCKZUG"}</span><b>${result.target}: Angriff ${result.attack} gegen ${result.defense}</b><small>Feldlager-Beute: ${stolen} · Verluste: ${losses}</small></div>`;
}

function raidPanel() {
  const pending = state.pendingRaid;
  if (pending) {
    const target = state.targets.find((item) => item.id === pending.targetId);
    return `<div class="inspector raid-inspector"><div class="inspector-title"><p>ÜBERFALL</p><h2>Marsch unterwegs</h2><span>Kein weiterer Marsch, bis die Truppe zurück ist.</span></div><div class="march-status"><span>MARSCH NACH ${target?.name?.toUpperCase() || "ZIELORT"}</span><b data-raid-countdown>${clock(remainingTime(pending.arrivesAt))}</b><small>Die Schlacht wird bei Ankunft ausgewertet.</small></div><button class="primary-action" disabled>Marsch läuft</button>${raidResult()}</div>`;
  }
  return `<div class="inspector raid-inspector"><div class="inspector-title"><p>ÜBERFALL</p><h2>Marsch planen</h2><span>Lokale Demo-Gegner · nur Feldlager raidbar</span></div><label class="target-select">Zielort <select id="raid-target">${state.targets.map((target) => `<option value="${target.id}">${target.name} · Verteidigung ${target.defense} · Feldlager ${format(Object.values(target.unclaimed).reduce((sum, amount) => sum + amount, 0))}</option>`).join("")}</select></label><div class="army-inputs">${Object.entries(TROOPS).map(([id, troop]) => `<label><span>${troop.label}<b>${state.troops[id]} bereit</b></span><input type="number" min="0" max="${state.troops[id]}" value="0" id="raid-${id}" inputmode="numeric"></label>`).join("")}</div><button class="primary-action" id="send-raid">Marsch starten · 01:00</button>${raidResult()}</div>`;
}

function panelContents() { return { build: buildInspector, army: armyPanel, market: marketPanel, raid: raidPanel }[activePanel](); }

function resourceHudItem(id, definition, production, capacity) {
  const stored = state.resources[id];
  const field = state.unclaimed[id];
  const fullness = Math.min(1, stored / capacity);
  return `<div class="resource ${definition.color}" data-resource="${id}"><img src="${RESOURCE_ASSETS[id]}" alt=""><span><small>${TOKEN_REGISTRY[id].symbol} · SPEICHER</small><strong data-resource-value>${format(stored)}</strong><b class="storage-capacity" data-resource-capacity>/${format(capacity)}</b><div class="storage-progress ${stored >= capacity ? "is-full" : ""}" role="progressbar" aria-label="${definition.label}-Speicher" aria-valuemin="0" aria-valuemax="${capacity}" aria-valuenow="${stored}"><i data-resource-progress style="transform:scaleX(${fullness})"></i></div><em data-resource-field>Feld ${format(field)} · +${format(production[id])}/s</em></span></div>`;
}

function refreshTickValues() {
  const production = getProduction(state);
  Object.keys(RESOURCE_DEFS).forEach((id) => {
    const resource = document.querySelector(`[data-resource="${id}"]`);
    if (!resource) return;
    resource.querySelector("[data-resource-field]").textContent = `Feld ${format(state.unclaimed[id])} · +${format(production[id])}/s`;
  });
  const readyToClaim = Object.values(state.unclaimed).reduce((sum, amount) => sum + amount, 0);
  const collectLabel = document.querySelector("[data-ready-to-claim]");
  const collection = collectionStatus();
  if (collectLabel) collectLabel.textContent = collection.locked ? collection.label : `${format(readyToClaim)} sammeln`;
  const collectButton = document.querySelector("#gather");
  if (collectButton) {
    collectButton.disabled = collection.locked;
    collectButton.querySelector("[data-collection-status]").textContent = collection.detail;
  }
  const raidCountdown = document.querySelector("[data-raid-countdown]");
  if (raidCountdown && state.pendingRaid) raidCountdown.textContent = clock(remainingTime(state.pendingRaid.arrivesAt));
}

function render() {
  settle(state);
  const production = getProduction(state);
  const capacity = getCapacity(state);
  const readyToClaim = Object.values(state.unclaimed).reduce((sum, amount) => sum + amount, 0);
  const collection = collectionStatus();
  document.querySelector("#app").innerHTML = `<section class="game-shell village-shell" style="--city-map-desktop:url('${CITY_MAPS.desktop}');--city-map-mobile:url('${CITY_MAPS.mobile}')"><header class="hud village-hud"><div class="game-mark"><span>IM</span><div><b>IDLE MINT</b><small>DORF VON MINTIA</small></div></div><div class="resource-hud">${Object.entries(RESOURCE_DEFS).map(([id, definition]) => resourceHudItem(id, definition, production, capacity)).join("")}</div><span class="demo-badge">DEMO · LOKAL</span></header><main class="command-layout"><section class="village-map" id="dorf" aria-label="Interaktive Stadtkarte von Mintia. Wähle ein Gebäude, um seinen Ausbau zu planen."><div class="map-head"><p>DORF VON MINTIA</p><h1>Dein Dorf.</h1><span>Rathaus ${state.buildings.townhall} · Speicher ${format(capacity)}</span></div><button class="collect-button" id="gather" ${collection.locked ? "disabled" : ""}><span data-collection-status>${collection.detail}</span><b data-ready-to-claim>${collection.locked ? collection.label : `${format(readyToClaim)} sammeln`}</b></button><div class="map-buildings">${BUILDING_IDS.map(buildingSpot).join("")}<button class="map-building map-market ${activePanel === "market" ? "is-selected" : ""}" data-panel="market" aria-label="Tauschhalle öffnen"><img src="${BUILDING_ASSETS.market}" alt=""><span><b>Tauschhalle</b><small>ERC-20 Markt</small></span></button></div><p class="map-feedback" aria-live="polite">${feedback}</p></section><aside class="command-rail"><nav class="command-tabs" aria-label="Dorfaktionen">${[["build", "Bauplan"], ["army", "Kaserne"], ["market", "Markt"], ["raid", "Überfall"]].map(([id, label]) => `<button data-panel="${id}" class="${activePanel === id ? "is-active" : ""}">${label}</button>`).join("")}</nav><section class="command-panel">${panelContents()}</section></aside></main><footer class="game-footer"><span><i></i> Speicher geschützt · Feldlager raidbar</span><span>${state.raids} Demo-Überfälle · Kein Wallet verbunden</span><button id="reset">Demo zurücksetzen</button></footer><nav class="mobile-hud" aria-label="Schnellzugriff">${[["build", "Bau"], ["army", "Armee"], ["market", "Markt"], ["raid", "Raid"]].map(([id, label]) => `<button data-panel="${id}" class="${activePanel === id ? "is-active" : ""}">${label}</button>`).join("")}</nav></section>`;

  document.querySelector("#gather").addEventListener("click", () => { const result = startGathering(state); const collected = result.ok ? costLine(result.collected) : ""; feedback = !result.ok ? "Sammler sind noch unterwegs." : collected ? `Im Speicher gesichert: ${collected}. Nächste Sammlung in 01:00.` : "Feldlager leer oder Speicher voll. Nächste Sammlung in 01:00."; save(); render(); });
  document.querySelectorAll("[data-map-building]").forEach((button) => button.addEventListener("click", () => { selectedBuilding = button.dataset.mapBuilding; activePanel = "build"; feedback = `${BUILDINGS[selectedBuilding].label} ausgewählt.`; render(); }));
  document.querySelectorAll("[data-panel]").forEach((button) => button.addEventListener("click", () => { activePanel = button.dataset.panel; feedback = { build: "Wähle ein Gebäude auf dem Dorfplan.", army: "Bilde Truppen aus, sobald die Kaserne bereit ist.", market: "Nur Holz, Lehm und Stein sind im Spielmarkt tauschbar.", raid: "Stelle eine Marschgruppe zusammen." }[activePanel]; render(); }));
  document.querySelectorAll("[data-building]").forEach((button) => button.addEventListener("click", () => { const id = button.dataset.building; const result = upgradeBuilding(state, id); feedback = result.ok ? `${BUILDINGS[id].label} auf Stufe ${state.buildings[id]} ausgebaut.` : "Ausbau noch gesperrt oder Rohstoffe fehlen."; save(); render(); }));
  document.querySelectorAll("[data-train]").forEach((button) => button.addEventListener("click", () => { const id = button.dataset.train; const result = trainTroop(state, id); feedback = result.ok ? `${TROOPS[id].label} ausgebildet.` : "Ausbildung noch gesperrt oder Rohstoffe fehlen."; save(); render(); }));
  document.querySelector("#market-swap")?.addEventListener("click", () => { const from = document.querySelector("#market-from").value; const to = document.querySelector("#market-to").value; const result = swapInternal(state, from, to, document.querySelector("#market-amount").value); feedback = result.ok ? `${format(result.output)} ${RESOURCE_DEFS[to].label} im Spielmarkt erhalten.` : "Tausch nicht möglich: Quelle, Ziel, Menge oder Speicher prüfen."; save(); render(); });
  document.querySelector("#send-raid")?.addEventListener("click", () => { const selected = Object.fromEntries(Object.keys(TROOPS).map((id) => [id, document.querySelector(`#raid-${id}`).value])); const result = startRaidMarch(state, document.querySelector("#raid-target").value, selected); feedback = result.ok ? "Marsch gestartet. Ankunft in 01:00." : "Wähle verfügbare Truppen für den Überfall."; save(); render(); });
  document.querySelector("#reset").addEventListener("click", () => { state = createInitialState(); selectedBuilding = "townhall"; activePanel = "build"; feedback = "Demo-Dorf zurückgesetzt."; localStorage.removeItem(STORAGE_KEY); render(); });
}

render();
setInterval(() => {
  settle(state);
  if (state.pendingRaid && Date.now() >= state.pendingRaid.arrivesAt) {
    const result = resolveRaidMarch(state);
    feedback = result.ok ? `Marsch beendet: ${result.ok && result.attack >= result.defense ? "Sieg" : "Rückzug"}.` : "Marsch konnte nicht ausgewertet werden.";
    save();
    render();
    return;
  }
  save();
  refreshTickValues();
}, 1000);
