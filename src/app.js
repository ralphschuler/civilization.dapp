import "./styles.css";
import { canRenderGameWorld } from "./world-gate.js";
import {
  BUILDINGS,
  RESOURCE_DEFS,
  TOKEN_REGISTRY,
  TROOPS,
  createInitialState,
  format,
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

const STORAGE_KEY = "civilization-village-demo-v1";
const asset = (path) => `${(globalThis.window?.__CIVILIZATION_ASSET_BASE__ || "").replace(/\/$/, "")}/assets/${path}`;
const BUILDING_ASSETS = {
  townhall: asset("village-v2/buildings/townhall.png"), timber: asset("village-v2/buildings/timber.png"), claypit: asset("village-v2/buildings/claypit.png"),
  quarry: asset("village-v2/buildings/quarry.png"), warehouse: asset("village-v2/buildings/warehouse.png"), workshop: asset("village-v2/buildings/workshop.png"),
  goldmine: asset("village-v2/buildings/goldmine.png"), barracks: asset("village-v2/buildings/barracks.png"), market: asset("village-v2/buildings/market.png"),
};
const RESOURCE_ASSETS = { wood: asset("village-v2/resources/wood.png"), clay: asset("village-v2/resources/clay.png"), stone: asset("village-v2/resources/stone.png"), gold: asset("village-v2/resources/gold.png") };
const TROOP_ASSETS = { spear: asset("units/spearman.png"), archer: asset("units/archer.png"), rider: asset("units/knight.png") };
const CITY_MAPS = {
  desktop: asset("maps/mintia-village-map-v1.png"),
  mobile: asset("maps/mintia-village-map-mobile-v2.png"),
};
const BUILDING_IDS = ["townhall", "timber", "claypit", "quarry", "warehouse", "workshop", "goldmine", "barracks"];
const MAX_BUILDING_LEVEL = 30;
let appRoot = null;
let runtimeMode = "world";
let worldApp = { installed: false };
let worldBadge = "DEMO · LOKAL";
let worldIdStatus = "local_demo";
let feedback = "Wähle ein Gebäude auf dem Dorfplan.";
let selectedBuilding = "townhall";
let activePanel = "build";
let state = null;
let worldAdapter = null;
let worldReady = false;
let worldLoading = false;
let worldBusy = false;
let worldRefreshInFlight = false;
let worldStateEpoch = 0;
let selectedOpponent = null;
let lifecycleGeneration = 0;
let buildDurations = new Map();

function isCurrent(generation) { return generation === lifecycleGeneration && appRoot; }

function activateWorldRuntime(mode, isInstalled, worldAccessConfirmed, worldWalletAddress) {
  runtimeMode = mode;
  worldApp = isInstalled ? { installed: true, walletAddress: worldWalletAddress || null } : { installed: false };
  worldBadge = worldApp.installed ? `WORLD APP${worldApp.walletAddress ? ` · ${worldApp.walletAddress.slice(0, 6)}…${worldApp.walletAddress.slice(-4)}` : " · VERBUNDEN"}` : "DEMO · LOKAL";
  worldIdStatus = worldApp.installed ? (worldAccessConfirmed ? "verified" : "not_verified") : "local_demo";
}

function worldError(error) {
  const reason = error instanceof Error ? error.message : "transaction_failed";
  return {
    user_rejected: "Transaktion abgebrochen.",
    contact_not_selected: "Kein World-Kontakt ausgewählt.",
    target_not_registered: "Dieses Wallet ist noch nicht für Civilization registriert.",
    self_raid: "Du kannst dein eigenes Dorf nicht angreifen.",
    world_app_wallet_required: "Diese Aktion muss direkt in World App bestätigt werden.",
    transaction_wallet_mismatch: "Wallet und angemeldete World-Adresse stimmen nicht überein.",
    world_market_unavailable: "Der aktuelle Contract bietet keinen Rohstoff-Swap.",
    receipt_timeout: "Transaktion eingereicht. Chain-Bestätigung steht noch aus.",
    claim_not_available: "Noch keine übertragbaren ganzen Ressourcen: Abklingzeit, Feldbestand und Speicher werden erneut geprüft.",
    transaction_pending: "Eine andere Transaktion wartet noch auf Chain-Bestätigung.",
  }[reason] || `World-Chain-Aktion fehlgeschlagen: ${reason}.`;
}

async function performWorldAction(type, payload, successMessage) {
  if (!worldReady || !worldAdapter || worldBusy) return null;
  const generation = lifecycleGeneration;
  worldBusy = true;
  feedback = "Bestätige die World-Chain-Transaktion in deiner Wallet.";
  render();
  try {
    const result = await worldAdapter.execute(type, payload);
    if (!isCurrent(generation)) return null;
    worldStateEpoch += 1;
    state = result.state;
    feedback = result.pending ? "Transaktion eingereicht. Der Chain-Status wird weiter aktualisiert." : successMessage;
    return result;
  } catch (error) {
    if (!isCurrent(generation)) return null;
    feedback = worldError(error);
    return null;
  } finally {
    if (!isCurrent(generation)) return;
    worldBusy = false;
    render();
  }
}

async function initializeWorldState({ quiet = false } = {}) {
  if (runtimeMode !== "world" || !worldAdapter || !hasGameAccess() || worldRefreshInFlight) return;
  const generation = lifecycleGeneration;
  worldRefreshInFlight = true;
  const requestEpoch = worldStateEpoch;
  if (!quiet) worldLoading = true;
  try {
    const nextState = await worldAdapter.readState();
    // A refresh begun before a receipt must never replace its post-receipt
    // readback with an older snapshot.
    if (!isCurrent(generation) || requestEpoch !== worldStateEpoch) return;
    state = nextState;
    worldReady = true;
    worldLoading = false;
    if (!quiet) feedback = "On-chain-Spielstand geladen. Aktionen werden direkt durch CivilizationGame geprüft.";
    render();
    if (worldAdapter.hasPending?.()) {
      worldBusy = true;
      feedback = "Ausstehende Transaktion wird anhand ihres vorhandenen Hashes geprüft.";
      render();
      try {
        const result = await worldAdapter.resumePending();
        if (!isCurrent(generation)) return;
        worldStateEpoch += 1;
        state = result?.state || state;
        feedback = result?.pending ? "Transaktion bleibt ausstehend. Der Chain-Status wird weiter aktualisiert." : "Ausstehende Transaktion wurde bestätigt.";
      } catch (error) {
        if (!isCurrent(generation)) return;
        feedback = worldError(error);
      } finally {
        if (!isCurrent(generation)) return;
        worldBusy = false;
        render();
      }
    }
  } catch (error) {
    if (!isCurrent(generation)) return;
    worldReady = false;
    worldLoading = false;
    feedback = worldError(error);
    render();
  } finally {
    if (!isCurrent(generation)) return;
    worldRefreshInFlight = false;
  }
}

function requestBuildDuration(buildingId, nextLevel) {
  if (runtimeMode !== "world" || !worldAdapter || !Number.isInteger(nextLevel) || nextLevel > MAX_BUILDING_LEVEL) return;
  const key = `${buildingId}:${nextLevel}`;
  if (buildDurations.has(key)) return;
  const generation = lifecycleGeneration;
  buildDurations.set(key, null);
  worldAdapter.readBuildDuration(buildingId, nextLevel).then((seconds) => {
    if (!isCurrent(generation)) return;
    buildDurations.set(key, Number(seconds));
    render(generation);
  }).catch(() => {
    if (!isCurrent(generation)) return;
    buildDurations.set(key, false);
    render(generation);
  });
}

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

function save() { if (runtimeMode === "demo") localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function worldNow() {
  if (!state?.accrual?.asOf || !Number.isFinite(state.performanceAnchor)) return 0;
  return state.accrual.asOf + Math.max(0, performance.now() - state.performanceAnchor);
}
function remainingTime(until) {
  const now = runtimeMode === "world" ? worldNow() : Date.now();
  return Math.max(0, Math.ceil((until - now) / 1000));
}
function clock(seconds) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const tail = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  if (days) return `${days}T ${String(hours).padStart(2, "0")}:${tail}`;
  return hours ? `${String(hours).padStart(2, "0")}:${tail}` : tail;
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]); }
function collectionStatus() {
  const seconds = remainingTime(state.gatherAvailableAt || 0);
  if (runtimeMode === "world" && !worldAdapter.claimEligibility(state)) return { locked: true, label: "Noch nichts übertragbar", detail: "CONTRACT-PRÜFUNG · FELD, SPEICHER ODER ABKLINGZEIT" };
  return seconds ? { locked: true, label: `Sammeln in ${clock(seconds)}`, detail: `SAMMLER KEHREN IN ${clock(seconds)} ZURÜCK` } : { locked: false, detail: "FELDLAGER · RAIDBAR" };
}

function resourceFormat(value) {
  return runtimeMode === "world"
    ? new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : format(value);
}

function hasGameAccess() { return runtimeMode === "demo" || (runtimeMode === "world" && canRenderGameWorld({ worldAppInstalled: worldApp.installed, worldIdStatus })); }
function activeBuildingCost(id) { return runtimeMode === "world" ? worldAdapter.getBuildingCost(state, id) : getBuildingCost(state, id); }
function activeRequirements(id) { return runtimeMode === "world" ? worldAdapter.getRequirements(state, id) : getRequirements(state, id); }
function activeTroopRequirements(id) { return runtimeMode === "world" ? worldAdapter.getTroopRequirements(state, id) : TROOPS[id].requires.filter(({ id: required, level }) => state.buildings[required] < level); }
function activeCapacity() { return runtimeMode === "world" ? worldAdapter.getCapacity(state) : getCapacity(state); }
function activeProduction() { return runtimeMode === "world" ? worldAdapter.getProduction(state) : getProduction(state); }
function productionUnit() { return runtimeMode === "world" ? "/Tag" : "/s"; }
function worldIdGateView() {
  return `<section class="world-id-gate" aria-labelledby="world-id-gate-title"><div class="world-id-gate-card"><span class="world-id-gate-mark">CD</span><p>WORLD MINI APP</p><h1 id="world-id-gate-title">Anmeldung erforderlich</h1><span>Der Zugang wird von der World-App-Vorschaltseite bestätigt.</span></div></section>`;
}
function worldRuntimeView() {
  const title = worldLoading ? "World Chain wird geladen" : "On-chain-Spielstand nicht verfügbar";
  return `<section class="world-id-gate" aria-labelledby="world-runtime-title"><div class="world-id-gate-card"><span class="world-id-gate-mark">CD</span><p>WORLD CHAIN</p><h1 id="world-runtime-title">${title}</h1><span>${escapeHtml(feedback)}</span>${worldLoading ? "" : '<button class="world-access-action" id="retry-world-state">Erneut prüfen</button>'}</div></section>`;
}
function requireWorldIdAccess() {
  if (hasGameAccess() && (runtimeMode === "demo" || (worldReady && !worldBusy))) return true;
  feedback = "World-ID-Verifizierung ist für den Spielzugang in World App erforderlich.";
  render();
  return false;
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
  const requirements = activeRequirements(selectedBuilding);
  const required = activeBuildingCost(selectedBuilding);
  const affordable = Object.keys(RESOURCE_DEFS).every((resource) => state.resources[resource] >= required[resource]);
  const maxed = level >= MAX_BUILDING_LEVEL;
  let production = "";
  if (building.produces) {
    if (runtimeMode === "world") {
      const nextState = { ...state, buildings: { ...state.buildings, [selectedBuilding]: level + 1 } };
      const rates = worldAdapter.getProduction(nextState);
      production = Object.keys(building.produces).map((resource) => `+${format(rates[resource])}/Tag ${RESOURCE_DEFS[resource].label}`).join(" · ");
    } else production = Object.entries(building.produces).map(([resource, rate]) => `+${format(rate * (level + 1))}/s ${RESOURCE_DEFS[resource].label}`).join(" · ");
  }
  const pending = runtimeMode === "world" && state.construction?.pending;
  let action;
  if (pending) {
    const seconds = remainingTime(state.construction.completesAt);
    const constructionLabel = BUILDINGS[state.construction.buildingId]?.label || "Gebäude";
    action = `<div class="requirement-box"><span>BAU LÄUFT · ${escapeHtml(constructionLabel)}</span><b data-construction-countdown>${seconds ? clock(seconds) : "Fertig"}</b><small>Der Contract erhöht die Stufe erst nach Abschluss.</small></div><button class="primary-action" id="complete-upgrade" ${seconds || worldBusy ? "disabled" : ""}>${seconds ? "Bau läuft" : "Ausbau abschließen"}</button><button class="primary-action" id="boost-construction" ${seconds <= 3600 || worldBusy ? "disabled" : ""}>1 Stunde für 1 WLD boosten</button>`;
  } else if (maxed) {
    action = `<div class="requirement-box"><span>MAXIMALSTUFE ERREICHT</span><b>${building.label} ist vollständig ausgebaut.</b><small>${selectedBuilding === "townhall" ? "Prestige setzt das Dorf zurück und erhöht Produktion dauerhaft um 10 %." : "Für dieses Gebäude ist kein weiterer Ausbau möglich."}</small></div>${runtimeMode === "world" && selectedBuilding === "townhall" ? `<button class="primary-action" id="prestige" ${worldBusy ? "disabled" : ""}>Prestige ${state.prestigeCount + 1} starten</button>` : ""}`;
  } else {
    const durationKey = `${selectedBuilding}:${level + 1}`;
    const duration = buildDurations.get(durationKey);
    const durationInfo = runtimeMode === "world" ? `<small class="build-duration">On-chain-Bauzeit: ${duration === null || duration === undefined ? "wird aus dem Contract geladen …" : duration === false ? "derzeit nicht lesbar" : clock(duration)}</small>` : "";
    action = `${requirements.length ? `<div class="requirement-box"><span>AUSBAU GESPERRT</span><b>${requirementsLine(requirements)}</b><small>Erfülle diese Stufen, um den Ausbau freizuschalten.</small></div>` : `<div class="upgrade-cost"><span>KOSTEN FÜR STUFE ${level + 1}</span><div>${costLine(required)}</div>${durationInfo}</div>`}<button class="primary-action" data-building="${selectedBuilding}" ${requirements.length || !affordable || worldBusy ? "disabled" : ""}>${requirements.length ? "Voraussetzungen erfüllen" : runtimeMode === "world" ? `Ausbau auf Stufe ${level + 1} starten` : `Auf Stufe ${level + 1} ausbauen`}</button>`;
  }
  return `<div class="inspector build-inspector"><div class="inspector-art"><img src="${BUILDING_ASSETS[selectedBuilding]}" alt="${building.label}"></div><div class="inspector-title"><p>GEBÄUDEDETAIL</p><h2>${building.label}</h2><span>Stufe ${level} → ${level + 1}</span></div><p class="inspector-copy">${building.detail}${production ? ` Nächste Produktion: ${production}.` : ""}</p><div class="inspector-divider"></div>${action}</div>`;
}

function troopCard(id) {
  const troop = TROOPS[id];
  const requirements = activeTroopRequirements(id);
  const affordable = Object.keys(RESOURCE_DEFS).every((resource) => state.resources[resource] >= troop.cost[resource]);
  return `<article class="troop-card ${requirements.length ? "is-locked" : ""}"><img src="${TROOP_ASSETS[id]}" alt="${troop.label}"><div><b>${troop.label}</b><small>Angriff ${troop.attack} · ${state.troops[id]} bereit</small>${requirements.length ? `<em>${requirementsLine(requirements)}</em>` : `<em>${costLine(troop.cost)}</em>`}</div><button data-train="${id}" ${requirements.length || !affordable || worldBusy ? "disabled" : ""}>+1</button></article>`;
}

function armyPanel() { return `<div class="inspector army-inspector"><div class="inspector-title"><p>KASERNE</p><h2>Armee ausbilden</h2><span>${Object.values(state.troops).reduce((sum, amount) => sum + amount, 0)} Einheiten bereit</span></div><div class="troop-list">${Object.keys(TROOPS).map(troopCard).join("")}</div></div>`; }

function tokenRows() {
  return Object.entries(TOKEN_REGISTRY).map(([resource, token]) => `<div class="token-row ${token.externalSettlement ? "token-gold" : ""}"><img src="${RESOURCE_ASSETS[resource]}" alt=""><span><b>${token.name} · ${token.symbol}</b><small>${token.externalSettlement ? "Nur in World-Modus als ERC-20" : "Interne Spielressource · kein Token"}</small></span><em>${token.externalSettlement ? "WORLD" : "INTERN"}</em></div>`).join("");
}

function marketPanel() {
  if (runtimeMode === "world") {
    return `<div class="inspector market-inspector"><div class="inspector-title"><p>TAUSCHHALLE</p><h2>CGOLD auf World Chain</h2><span>Contract-Status</span></div><div class="token-registry"><div class="token-row token-gold"><img src="${RESOURCE_ASSETS.gold}" alt=""><span><b>Civilization Gold · CGOLD</b><small>ERC-20 · direkt im CivilizationGame</small></span><em>ON-CHAIN</em></div></div><div class="gold-boundary"><span>SETTLEMENT NOCH DEAKTIVIERT</span><b>Dieser Contract enthält keinen Kauf-, Verkauf- oder Rohstoff-Swap.</b><small>Ein 1,5-%-Sink und WLD/CGOLD-Handel benötigen einen separat geprüften Settlement-Contract. Hier wird keine Off-chain-Ersatzbuchung simuliert.</small><button disabled>Handel nicht verfügbar</button></div></div>`;
  }
  return `<div class="inspector market-inspector"><div class="inspector-title"><p>TAUSCHHALLE</p><h2>Rohstoffe handeln</h2><span>Lokale Demo-Buchung</span></div><div class="token-registry">${tokenRows()}</div><div class="market-controls"><label>Von<select id="market-from"><option value="wood">Holz</option><option value="clay">Lehm</option><option value="stone">Stein</option></select></label><label>Zu<select id="market-to"><option value="clay">Lehm</option><option value="wood">Holz</option><option value="stone">Stein</option></select></label><label>Menge<input id="market-amount" type="number" min="1" value="25" inputmode="numeric"></label></div><button class="primary-action" id="market-swap">Im Demo-Spiel tauschen</button><div class="gold-boundary"><span>CIVILIZATION GOLD</span><b>CGOLD existiert nur im World-Chain-Contract.</b><small>Diese Browserdemo simuliert weder Token noch WLD-Handel.</small><button disabled>Settlement nicht in Demo verfügbar</button></div></div>`;
}

function raidResult() {
  if (!state.lastRaid) return `<div class="raid-result"><span>LETZTER BERICHT</span><b>Noch keine Truppen entsandt.</b><small>Wähle ${runtimeMode === "world" ? "einen World-Kontakt oder eine registrierte Wallet" : "ein Demo-Dorf"} und deine Marschgruppe.</small></div>`;
  const result = state.lastRaid;
  const stolen = costLine(result.stolen) || "Keine Beute";
  const losses = Object.entries(result.casualties).filter(([, amount]) => amount).map(([id, amount]) => `${amount} ${TROOPS[id].label}`).join(", ") || "Keine Verluste";
  return `<div class="raid-result ${result.ok ? "success" : "failure"}"><span>LETZTER BERICHT · ${result.ok ? "SIEG" : "RÜCKZUG"}</span><b>${escapeHtml(result.target)}: Angriff ${result.attack} gegen ${result.defense}</b><small>Feldlager-Beute: ${stolen} · Verluste: ${losses}</small></div>`;
}

function raidPanel() {
  const pending = state.pendingRaid;
  if (pending) {
    const target = runtimeMode === "demo" ? state.targets.find((item) => item.id === pending.targetId) : null;
    const seconds = remainingTime(pending.arrivesAt);
    const targetName = target?.name || (runtimeMode === "world" ? `${pending.targetId.slice(0, 6)}…${pending.targetId.slice(-4)}` : "Zielort");
    return `<div class="inspector raid-inspector"><div class="inspector-title"><p>ÜBERFALL</p><h2>Marsch unterwegs</h2><span>Kein weiterer Marsch, bis die Truppe zurück ist.</span></div><div class="march-status"><span>MARSCH NACH ${escapeHtml(targetName.toUpperCase())}</span><b data-raid-countdown>${clock(seconds)}</b><small>${runtimeMode === "world" ? "Die Auflösung benötigt danach deine ausdrückliche Wallet-Bestätigung." : "Die Schlacht wird bei Ankunft ausgewertet."}</small></div>${runtimeMode === "world" ? `<button class="primary-action" id="resolve-raid" ${seconds || worldBusy ? "disabled" : ""}>${seconds ? "Marsch läuft" : "Schlacht auswerten"}</button>` : '<button class="primary-action" disabled>Marsch läuft</button>'}${raidResult()}</div>`;
  }
  if (runtimeMode === "world") {
    const chosen = selectedOpponent ? `<div class="requirement-box"><span>GEWÄHLTER KONTAKT</span><b>${escapeHtml(selectedOpponent.username)}</b><small>${escapeHtml(selectedOpponent.address)}</small></div>` : "";
    return `<div class="inspector raid-inspector"><div class="inspector-title"><p>ÜBERFALL</p><h2>Marsch planen</h2><span>On-chain-Dorf · nur Feldbestand raidbar</span></div>${chosen}<button class="primary-action" id="pick-raid-contact" ${worldBusy ? "disabled" : ""}>World-Kontakt wählen</button><label class="target-select">Oder Wallet-Adresse <input id="raid-target-address" type="text" value="${escapeHtml(selectedOpponent?.address || "")}" placeholder="0x…" autocomplete="off"></label><div class="army-inputs">${Object.entries(TROOPS).map(([id, troop]) => `<label><span>${troop.label}<b>${state.troops[id]} bereit</b></span><input type="number" min="0" max="${state.troops[id]}" value="0" id="raid-${id}" inputmode="numeric"></label>`).join("")}</div><button class="primary-action" id="send-raid" ${worldBusy ? "disabled" : ""}>Marsch starten · 01:00</button>${raidResult()}</div>`;
  }
  const targetOptions = state.targets.map((target) => `<option value="${target.id}">${escapeHtml(target.name)} · Verteidigung ${target.defense} · Feldlager ${format(Object.values(target.unclaimed).reduce((sum, amount) => sum + amount, 0))}</option>`).join("");
  const empty = !state.targets.length;
  return `<div class="inspector raid-inspector"><div class="inspector-title"><p>ÜBERFALL</p><h2>Marsch planen</h2><span>Lokale Demo-Gegner · nur Feldlager raidbar</span></div><label class="target-select">Zielort <select id="raid-target" ${empty ? "disabled" : ""}>${targetOptions || "<option>Keine Demo-Dörfer verfügbar</option>"}</select></label><div class="army-inputs">${Object.entries(TROOPS).map(([id, troop]) => `<label><span>${troop.label}<b>${state.troops[id]} bereit</b></span><input type="number" min="0" max="${state.troops[id]}" value="0" id="raid-${id}" inputmode="numeric"></label>`).join("")}</div><button class="primary-action" id="send-raid" ${empty ? "disabled" : ""}>Marsch starten · 01:00</button>${raidResult()}</div>`;
}

function panelContents() { return { build: buildInspector, army: armyPanel, market: marketPanel, raid: raidPanel }[activePanel](); }

function resourceHudItem(id, definition, production, capacity, displayState) {
  const stored = state.resources[id];
  const field = displayState.unclaimed[id];
  const fullness = Math.min(1, stored / capacity);
  const worldGold = runtimeMode === "world" && id === "gold";
  const symbol = worldGold ? "CGOLD" : TOKEN_REGISTRY[id].symbol;
  return `<div class="resource ${definition.color}" data-resource="${id}"><img src="${RESOURCE_ASSETS[id]}" alt=""><span><small>${symbol} · ${worldGold ? "WALLET" : "SPEICHER"}</small><strong data-resource-value>${resourceFormat(stored)}</strong>${worldGold ? "" : `<b class="storage-capacity" data-resource-capacity>/${resourceFormat(capacity)}</b><div class="storage-progress ${stored >= capacity ? "is-full" : ""}" role="progressbar" aria-label="${definition.label}-Speicher" aria-valuemin="0" aria-valuemax="${capacity}" aria-valuenow="${stored}"><i data-resource-progress style="transform:scaleX(${fullness})"></i></div>`}<em data-resource-field>Feld ${resourceFormat(field)} · +${resourceFormat(production[id])}${productionUnit()}</em></span></div>`;
}

function refreshTickValues() {
  if (!state) return;
  // World snapshots are authoritative. The adapter only projects their field
  // stock for display between RPC reads; it never writes projected values back.
  const displayState = runtimeMode === "world" ? worldAdapter.projectState(state, performance.now()) : state;
  const production = activeProduction();
  Object.keys(RESOURCE_DEFS).forEach((id) => {
    const resource = document.querySelector(`[data-resource="${id}"]`);
    if (!resource) return;
    resource.querySelector("[data-resource-field]").textContent = `Feld ${resourceFormat(displayState.unclaimed[id])} · +${resourceFormat(production[id])}${productionUnit()}`;
  });
  const readyToClaim = Object.values(displayState.unclaimed).reduce((sum, amount) => sum + amount, 0);
  const collectLabel = document.querySelector("[data-ready-to-claim]");
  const collection = collectionStatus();
  if (collectLabel) collectLabel.textContent = collection.locked ? collection.label : `${resourceFormat(readyToClaim)} sammeln`;
  const collectButton = document.querySelector("#gather");
  if (collectButton) {
    collectButton.disabled = collection.locked || worldBusy;
    collectButton.querySelector("[data-collection-status]").textContent = collection.detail;
  }
  const raidCountdown = document.querySelector("[data-raid-countdown]");
  if (raidCountdown && state.pendingRaid) {
    const seconds = remainingTime(state.pendingRaid.arrivesAt);
    raidCountdown.textContent = clock(seconds);
    const resolve = document.querySelector("#resolve-raid");
    if (resolve) { resolve.disabled = seconds > 0 || worldBusy; resolve.textContent = seconds ? "Marsch läuft" : "Schlacht auswerten"; }
  }
  const constructionCountdown = document.querySelector("[data-construction-countdown]");
  if (constructionCountdown && state.construction?.pending) {
    const seconds = remainingTime(state.construction.completesAt);
    constructionCountdown.textContent = seconds ? clock(seconds) : "Fertig";
    const complete = document.querySelector("#complete-upgrade");
    if (complete) { complete.disabled = seconds > 0 || worldBusy; complete.textContent = seconds ? "Bau läuft" : "Ausbau abschließen"; }
    const boost = document.querySelector("#boost-construction");
    if (boost) boost.disabled = seconds <= 3600 || worldBusy;
  }
}

function render(generation = lifecycleGeneration) {
  if (!isCurrent(generation)) return;
  if (!hasGameAccess()) {
    appRoot.innerHTML = worldIdGateView();
    return;
  }
  if (runtimeMode === "world" && (!worldReady || !state)) {
    appRoot.innerHTML = worldRuntimeView();
    document.querySelector("#retry-world-state")?.addEventListener("click", () => initializeWorldState());
    return;
  }
  if (runtimeMode === "demo") settle(state);
  const production = activeProduction();
  const capacity = activeCapacity();
  const displayState = runtimeMode === "world" ? worldAdapter.projectState(state, performance.now()) : state;
  const readyToClaim = Object.values(displayState.unclaimed).reduce((sum, amount) => sum + amount, 0);
  const collection = collectionStatus();
  appRoot.innerHTML = `<section class="game-shell village-shell" style="--city-map-desktop:url('${CITY_MAPS.desktop}');--city-map-mobile:url('${CITY_MAPS.mobile}')"><header class="hud village-hud"><div class="game-mark"><span>CD</span><div><b>CIVILIZATION</b><small>DAPP · DORF VON MINTIA</small></div></div><div class="resource-hud">${Object.entries(RESOURCE_DEFS).map(([id, definition]) => resourceHudItem(id, definition, production, capacity, displayState)).join("")}</div><span class="demo-badge ${worldApp.installed ? "is-world" : ""}">${worldBadge}</span></header><main class="command-layout"><section class="village-map" id="dorf" aria-label="Interaktive Stadtkarte von Mintia. Wähle ein Gebäude, um seinen Ausbau zu planen."><div class="map-head"><p>DORF VON MINTIA</p><h1>Dein Dorf.</h1><span>Rathaus ${state.buildings.townhall} · Speicher ${format(capacity)}${runtimeMode === "world" ? ` · Prestige ${state.prestigeCount}` : ""}</span></div><button class="collect-button" id="gather" ${collection.locked || worldBusy ? "disabled" : ""}><span data-collection-status>${collection.detail}</span><b data-ready-to-claim>${collection.locked ? collection.label : `${resourceFormat(readyToClaim)} sammeln`}</b></button><div class="map-buildings">${BUILDING_IDS.map(buildingSpot).join("")}<button class="map-building map-market ${activePanel === "market" ? "is-selected" : ""}" data-panel="market" aria-label="Tauschhalle öffnen"><img src="${BUILDING_ASSETS.market}" alt=""><span><b>Tauschhalle</b><small>${runtimeMode === "world" ? "CGOLD" : "Demo-Markt"}</small></span></button></div><p class="map-feedback" aria-live="polite">${feedback}</p></section><aside class="command-rail"><nav class="command-tabs" aria-label="Dorfaktionen">${[["build", "Bauplan"], ["army", "Kaserne"], ["market", "Markt"], ["raid", "Überfall"]].map(([id, label]) => `<button data-panel="${id}" class="${activePanel === id ? "is-active" : ""}">${label}</button>`).join("")}</nav><section class="command-panel">${panelContents()}</section></aside></main><footer class="game-footer"><span><i></i> ${runtimeMode === "world" ? "CivilizationGame ist alleinige Spielautorität" : "Demo-Speicher · nur lokal"}</span><span>${runtimeMode === "demo" ? `${state.raids} Demo-Überfälle · Kein Wallet verbunden` : `Prestige ${state.prestigeCount} · World Chain`}</span>${runtimeMode === "demo" ? '<button id="reset">Demo zurücksetzen</button>' : ""}</footer><nav class="mobile-hud" aria-label="Schnellzugriff">${[["build", "Bau"], ["army", "Armee"], ["market", "Markt"], ["raid", "Überfall"]].map(([id, label]) => `<button data-panel="${id}" class="${activePanel === id ? "is-active" : ""}">${label}</button>`).join("")}</nav></section>`;

  document.querySelector("#gather").addEventListener("click", async () => { if (!requireWorldIdAccess()) return; if (runtimeMode === "world") return performWorldAction("claim", {}, "Feldressourcen im Contract gesichert. Nächste Sammlung nach 01:00."); const result = startGathering(state); const collected = result.ok ? costLine(result.collected) : ""; feedback = !result.ok ? "Sammler sind noch unterwegs." : collected ? `Im Speicher gesichert: ${collected}. Nächste Sammlung in 01:00.` : "Feldlager leer oder Speicher voll. Nächste Sammlung in 01:00."; save(); render(); });
  document.querySelectorAll("[data-map-building]").forEach((button) => button.addEventListener("click", () => { selectedBuilding = button.dataset.mapBuilding; activePanel = "build"; feedback = `${BUILDINGS[selectedBuilding].label} ausgewählt.`; render(); }));
  document.querySelectorAll("[data-panel]").forEach((button) => button.addEventListener("click", () => { activePanel = button.dataset.panel; feedback = { build: "Wähle ein Gebäude auf dem Dorfplan.", army: "Bilde Truppen aus, sobald die Kaserne bereit ist.", market: runtimeMode === "world" ? "CGOLD ist on-chain; Settlement ist im aktuellen Contract deaktiviert." : "Nur Holz, Lehm und Stein sind im Demo-Markt tauschbar.", raid: "Stelle eine Marschgruppe zusammen." }[activePanel]; render(); }));
  document.querySelectorAll("[data-building]").forEach((button) => button.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; const id = button.dataset.building; if (runtimeMode === "world") return performWorldAction("upgrade", { building: id }, `${BUILDINGS[id].label}-Ausbau gestartet.`); const result = upgradeBuilding(state, id); feedback = result.ok ? `${BUILDINGS[id].label} auf Stufe ${state.buildings[id]} ausgebaut.` : "Ausbau noch gesperrt oder Rohstoffe fehlen."; save(); render(); }));
  document.querySelector("#complete-upgrade")?.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; await performWorldAction("complete_upgrade", {}, "Ausbau on-chain abgeschlossen."); });
  document.querySelector("#boost-construction")?.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; await performWorldAction("boost", { hours: 1 }, "Bauzeit um 1 Stunde reduziert; 1 WLD ging direkt an den Revenue Splitter."); });
  document.querySelector("#prestige")?.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; await performWorldAction("prestige", {}, "Prestige abgeschlossen. Dorf zurückgesetzt, Produktionsbonus erhöht."); });
  document.querySelectorAll("[data-train]").forEach((button) => button.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; const id = button.dataset.train; if (runtimeMode === "world") return performWorldAction("train", { troop: id, amount: 1 }, `${TROOPS[id].label} on-chain ausgebildet.`); const result = trainTroop(state, id); feedback = result.ok ? `${TROOPS[id].label} ausgebildet.` : "Ausbildung noch gesperrt oder Rohstoffe fehlen."; save(); render(); }));
  document.querySelector("#market-swap")?.addEventListener("click", () => { if (runtimeMode !== "demo") return; const from = document.querySelector("#market-from").value; const to = document.querySelector("#market-to").value; const amount = Number(document.querySelector("#market-amount").value); const result = swapInternal(state, from, to, amount); feedback = result.ok ? `${format(result.output)} ${RESOURCE_DEFS[to].label} im Demo-Markt erhalten.` : "Tausch nicht möglich: Quelle, Ziel, Menge oder Speicher prüfen."; save(); render(); });
  document.querySelector("#pick-raid-contact")?.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; const generation = lifecycleGeneration; worldBusy = true; feedback = "Öffne deine World-Kontakte."; render(); try { const opponent = await worldAdapter.pickOpponent(); if (!isCurrent(generation)) return; selectedOpponent = opponent; feedback = `${opponent.username} als Ziel gewählt.`; } catch (error) { if (!isCurrent(generation)) return; feedback = worldError(error); } finally { if (!isCurrent(generation)) return; worldBusy = false; render(); } });
  document.querySelector("#send-raid")?.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; const targetId = runtimeMode === "world" ? document.querySelector("#raid-target-address").value.trim() : document.querySelector("#raid-target").value; const selected = Object.fromEntries(Object.keys(TROOPS).map((id) => [id, Number(document.querySelector(`#raid-${id}`).value)])); if (runtimeMode === "world") return performWorldAction("start_raid", { targetId, army: selected }, "Marsch on-chain gestartet. Ankunft in 01:00."); const result = startRaidMarch(state, targetId, selected); feedback = result.ok ? "Marsch gestartet. Ankunft in 01:00." : "Wähle verfügbare Truppen für den Überfall."; save(); render(); });
  document.querySelector("#resolve-raid")?.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; await performWorldAction("resolve_raid", {}, "Schlacht on-chain ausgewertet."); });
  document.querySelector("#reset")?.addEventListener("click", () => { if (runtimeMode !== "demo") return; selectedBuilding = "townhall"; activePanel = "build"; state = createInitialState(); feedback = "Demo-Dorf zurückgesetzt."; localStorage.removeItem(STORAGE_KEY); render(); });
  if (runtimeMode === "world" && !state.construction?.pending && state.buildings[selectedBuilding] < MAX_BUILDING_LEVEL) requestBuildDuration(selectedBuilding, state.buildings[selectedBuilding] + 1);
}

let gameTimer = null;
let worldRefreshTicks = 0;
let visibilityRefreshHandler = null;

/** @param {{root: HTMLElement | null, runtimeMode?: "demo" | "world", worldAppInstalled?: boolean, worldAccessConfirmed?: boolean, worldWalletAddress?: string | null, worldAdapter?: object | null}} args */
export function startCivilizationApp({ root, runtimeMode: mode = "world", worldAppInstalled = false, worldAccessConfirmed = false, worldWalletAddress = null, worldAdapter: adapter = null }) {
  if (!root || gameTimer) return;
  lifecycleGeneration += 1;
  appRoot = root;
  state = mode === "demo" ? load() : null;
  worldAdapter = adapter;
  worldReady = mode === "demo";
  worldLoading = mode === "world";
  worldBusy = false;
  worldRefreshInFlight = false;
  worldRefreshTicks = 0;
  worldStateEpoch += 1;
  buildDurations = new Map();
  selectedOpponent = null;
  selectedBuilding = "townhall";
  activePanel = "build";
  feedback = mode === "world" ? "On-chain-Spielstand wird geladen." : "Wähle ein Gebäude auf dem Dorfplan.";
  activateWorldRuntime(mode, worldAppInstalled, worldAccessConfirmed, worldWalletAddress);
  render();
  if (runtimeMode === "world" && hasGameAccess()) initializeWorldState();
  visibilityRefreshHandler = () => {
    if (document.visibilityState === "visible" && runtimeMode === "world") initializeWorldState({ quiet: true });
  };
  document.addEventListener("visibilitychange", visibilityRefreshHandler);
  gameTimer = setInterval(() => {
    if (!hasGameAccess()) return;
    if (runtimeMode === "world") {
      if (!worldReady || !state) return;
      refreshTickValues();
      worldRefreshTicks += 1;
      if (worldRefreshTicks >= 30) {
        worldRefreshTicks = 0;
        initializeWorldState({ quiet: true });
      }
      return;
    }
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
}

export function stopCivilizationApp() {
  lifecycleGeneration += 1;
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = null;
  appRoot = null;
  state = null;
  worldAdapter = null;
  worldReady = false;
  worldLoading = false;
  worldBusy = false;
  worldRefreshInFlight = false;
  worldRefreshTicks = 0;
  worldStateEpoch += 1;
  buildDurations = new Map();
  if (visibilityRefreshHandler) document.removeEventListener("visibilitychange", visibilityRefreshHandler);
  visibilityRefreshHandler = null;
  selectedOpponent = null;
}
