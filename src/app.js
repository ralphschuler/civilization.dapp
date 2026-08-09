import "./styles.css";
import {
  BUILDINGS,
  RESOURCE_DEFS,
  TROOPS,
  TOKEN_REGISTRY,
  createInitialState,
  format,
  gather,
  getBuildingCost,
  getCapacity,
  getProduction,
  getRequirements,
  sendRaid,
  settle,
  swapInternal,
  trainTroop,
  upgradeBuilding,
} from "./game.js";

const STORAGE_KEY = "idlemint-village-demo-v1";
let feedback = "Baue dein Dorf aus und öffne die Kaserne.";
let state = load();

function load() {
  const initial = createInitialState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved?.resources || !saved?.buildings || !saved?.troops) return initial;
    return {
      ...initial,
      ...saved,
      resources: { ...initial.resources, ...saved.resources },
      buildings: { ...initial.buildings, ...saved.buildings },
      troops: { ...initial.troops, ...saved.troops },
      targets: saved.targets || initial.targets,
    };
  } catch {
    return initial;
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function costLine(value) {
  return Object.entries(RESOURCE_DEFS)
    .filter(([resource]) => value[resource] > 0)
    .map(([resource, definition]) => `<span class="cost ${definition.color}">${format(value[resource])} ${definition.short}</span>`)
    .join("");
}

function requirementsLine(requirements) {
  return requirements.map(({ id, level }) => `${BUILDINGS[id].label} ${level}`).join(" · ");
}

function buildingCard(id) {
  const building = BUILDINGS[id];
  const level = state.buildings[id];
  const requirements = getRequirements(state, id);
  const required = getBuildingCost(state, id);
  const affordable = Object.keys(RESOURCE_DEFS).every((resource) => state.resources[resource] >= required[resource]);
  const locked = requirements.length > 0;
  return `
    <article class="building-card ${locked ? "is-locked" : ""}">
      <div class="building-icon building-${id}">${building.icon}</div>
      <div class="building-copy"><div><b>${building.label}</b><span>LVL ${level}</span></div><small>${building.detail}</small></div>
      <div class="building-action">
        ${locked ? `<small class="locked-copy">Benötigt: ${requirementsLine(requirements)}</small>` : `<small>${costLine(required)}</small>`}
        <button data-building="${id}" ${locked || !affordable ? "disabled" : ""}>Ausbauen</button>
      </div>
    </article>`;
}

function troopCard(id) {
  const troop = TROOPS[id];
  const requirements = troop.requires.filter(({ id: required, level }) => state.buildings[required] < level);
  const affordable = Object.keys(RESOURCE_DEFS).every((resource) => state.resources[resource] >= troop.cost[resource]);
  return `
    <article class="troop-card ${requirements.length ? "is-locked" : ""}">
      <div class="troop-icon">${troop.icon}</div>
      <div class="troop-copy"><b>${troop.label}</b><small>Angriff ${troop.attack} · Bestand ${state.troops[id]}</small></div>
      <div class="troop-action">
        ${requirements.length ? `<small class="locked-copy">${requirementsLine(requirements)}</small>` : `<small>${costLine(troop.cost)}</small>`}
        <button data-train="${id}" ${requirements.length || !affordable ? "disabled" : ""}>+1 ausbilden</button>
      </div>
    </article>`;
}

function raidResult() {
  if (!state.lastRaid) return `<div class="raid-result"><span>LETZTER BERICHT</span><b>Noch keine Truppen entsandt.</b><small>Wähle ein Demo-Dorf und deine Marschgruppe.</small></div>`;
  const result = state.lastRaid;
  const stolen = costLine(result.stolen) || "Keine Beute";
  const losses = Object.entries(result.casualties).filter(([, amount]) => amount).map(([id, amount]) => `${amount} ${TROOPS[id].label}`).join(", ") || "Keine Verluste";
  return `<div class="raid-result ${result.ok ? "success" : "failure"}"><span>LETZTER BERICHT · ${result.ok ? "SIEG" : "RÜCKZUG"}</span><b>${result.target}: Angriff ${result.attack} gegen ${result.defense}</b><small>Beute: ${stolen} · Verluste: ${losses}</small></div>`;
}

function tokenRows() {
  return Object.entries(TOKEN_REGISTRY).map(([resource, token]) => `
    <div class="token-row ${token.externalSettlement ? "token-gold" : ""}">
      <i>${token.symbol}</i><span><b>${token.name}</b><small>${token.externalSettlement ? `ERC-20 · Gold-Paare: ${token.pairs.join(" / ")}` : "ERC-20 · nur In-Game-Markt"}</small></span>
      <em>${token.externalSettlement ? "SETTLEMENT" : "IN-GAME"}</em>
    </div>`).join("");
}

function render() {
  settle(state);
  const production = getProduction(state);
  const capacity = getCapacity(state);
  document.querySelector("#app").innerHTML = `
    <section class="game-shell village-shell">
      <header class="hud village-hud">
        <div class="game-mark"><span>IM</span><div><b>IDLE MINT</b><small>DORF // 01</small></div></div>
        <div class="resource-hud" aria-live="polite">${Object.entries(RESOURCE_DEFS).map(([id, definition]) => `<div class="resource ${definition.color}"><i>${definition.icon}</i><span><small>${definition.short}</small><strong>${format(state.resources[id])}</strong><em>+${format(production[id])}/s</em></span></div>`).join("")}</div>
        <span class="demo-badge">DEMO · LOKAL</span>
      </header>

      <main class="village-board">
        <section class="village-scene" id="dorf" aria-label="Dorfzentrum">
          <div class="scene-copy"><p>DORF VON MINTIA</p><h1>Wachse.<br>Verteidige.<br>Plündere.</h1><span>Rathaus ${state.buildings.townhall} · Speicher ${format(capacity)} pro Rohstoff</span></div>
          <div class="village-status"><span>AKTIVE SCHICHT</span><b>LOKALER TICK</b><small>Worldchain-Link: inaktiv</small></div>
          <div class="village-core">
            <span class="orbit orbit-one"></span><span class="orbit orbit-two"></span>
            <button class="mint-button gather-button" id="gather" aria-label="Rohstoffe einsammeln"><span class="core-symbol">DORF</span><b>SAMMELN</b><small>Rohstoffschicht abholen</small></button>
          </div>
          <div class="scene-floor"></div>
          <p class="game-feedback" aria-live="polite">${feedback}</p>
        </section>

        <aside class="village-side">
          <section class="panel building-panel" id="bau"><div class="panel-head"><p>BAUPLAN</p><span>RATHAUS ${state.buildings.townhall}</span><h2>Dorf ausbauen</h2></div><div class="building-list">${["townhall", "timber", "claypit", "quarry", "warehouse", "workshop", "goldmine", "barracks"].map(buildingCard).join("")}</div></section>

          <section class="panel barracks-panel" id="armee"><div class="panel-head"><p>KASERNE</p><span>${Object.values(state.troops).reduce((sum, amount) => sum + amount, 0)} EINHEITEN</span><h2>Armee ausbilden</h2></div><div class="troop-list">${Object.keys(TROOPS).map(troopCard).join("")}</div></section>

          <section class="panel market-panel" id="markt"><div class="panel-head"><p>TAUSCHHALLE</p><span>ERC-20-LEDGER</span><h2>Rohstoffe handeln</h2></div>
            <div class="token-registry">${tokenRows()}</div>
            <div class="market-controls"><label>Von<select id="market-from"><option value="wood">Holz · IMW</option><option value="clay">Lehm · IMC</option><option value="stone">Stein · IMS</option></select></label><label>Zu<select id="market-to"><option value="clay">Lehm · IMC</option><option value="wood">Holz · IMW</option><option value="stone">Stein · IMS</option></select></label><label>Menge<input id="market-amount" type="number" min="1" value="25" inputmode="numeric"></label></div>
            <button class="send-raid market-swap" id="market-swap">Im Spiel tauschen</button>
            <div class="gold-boundary"><span>GOLD-SETTLEMENT</span><b>IMG ist einzige externe Brücke.</b><small>WLD / WBTC erst nach Audit, Liquidität und World-App-Allowlisting.</small><button disabled>Gold gegen WLD oder WBTC tauschen</button></div>
          </section>

          <section class="panel raid-panel"><div class="panel-head"><p>ÜBERFALL</p><span>DEMO-GEGNER</span><h2>Marsch planen</h2></div>
            <label class="target-select">Zielort <select id="raid-target">${state.targets.map((target) => `<option value="${target.id}">${target.name} · Verteidigung ${target.defense}</option>`).join("")}</select></label>
            <div class="army-inputs">${Object.entries(TROOPS).map(([id, troop]) => `<label><span>${troop.label} <b>${state.troops[id]} bereit</b></span><input type="number" min="0" max="${state.troops[id]}" value="0" id="raid-${id}" inputmode="numeric"></label>`).join("")}</div>
            <button class="send-raid" id="send-raid">Truppen entsenden</button>
            ${raidResult()}
          </section>
        </aside>
      </main>
      <footer class="game-footer"><span><i></i> Lokaler Speicher aktiv</span><span>${state.raids} Demo-Überfälle · Kein Wallet verbunden</span><button id="reset">Demo zurücksetzen</button></footer>
      <nav class="mobile-hud"><a href="#dorf">DORF</a><a href="#bau">BAU</a><a href="#armee">ARMEE</a></nav>
    </section>`;

  document.querySelector("#gather").addEventListener("click", () => {
    gather(state);
    feedback = "Rohstoffschicht eingesammelt. Baue die Produktionsstätten weiter aus.";
    save();
    render();
  });
  document.querySelectorAll("[data-building]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.building;
    const result = upgradeBuilding(state, id);
    feedback = result.ok ? `${BUILDINGS[id].label} auf Stufe ${state.buildings[id]} ausgebaut.` : "Ausbau noch gesperrt oder Rohstoffe fehlen.";
    save();
    render();
  }));
  document.querySelectorAll("[data-train]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.train;
    const result = trainTroop(state, id);
    feedback = result.ok ? `${TROOPS[id].label} ausgebildet.` : "Ausbildung noch gesperrt oder Rohstoffe fehlen.";
    save();
    render();
  }));
  document.querySelector("#market-swap").addEventListener("click", () => {
    const from = document.querySelector("#market-from").value;
    const to = document.querySelector("#market-to").value;
    const result = swapInternal(state, from, to, document.querySelector("#market-amount").value);
    feedback = result.ok ? `${format(result.output)} ${RESOURCE_DEFS[to].label} im In-Game-Markt erhalten.` : "Tausch nicht möglich: Quelle, Ziel, Menge oder Speicher prüfen.";
    save();
    render();
  });
  document.querySelector("#send-raid").addEventListener("click", () => {
    const selected = Object.fromEntries(Object.keys(TROOPS).map((id) => [id, document.querySelector(`#raid-${id}`).value]));
    const result = sendRaid(state, document.querySelector("#raid-target").value, selected);
    feedback = result.ok ? "Marschbericht im Überfall-Panel aktualisiert." : "Wähle verfügbare Truppen für den Überfall.";
    save();
    render();
  });
  document.querySelector("#reset").addEventListener("click", () => {
    state = createInitialState();
    feedback = "Demo-Dorf zurückgesetzt.";
    localStorage.removeItem(STORAGE_KEY);
    render();
  });
}

render();
setInterval(() => { settle(state); save(); render(); }, 1000);
