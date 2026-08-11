import "./styles.css";
import { authenticateWorldWallet, buildTestnetRegistration, confirmWorldIdRegistration, getWorldIdConfig, installWorldAppBridge, requestWorldIdGameAccess, reserveWorldIdConnectorWindow, submitTestnetRegistration, submitWorldIdRegistration } from "./world.js";
import { canRenderGameWorld, canRetryWorldIdVerification } from "./world-gate.js";
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
const ANONYMOUS_ID_KEY = "idlemint-anonymous-browser-id-v1";
const asset = (path) => `${import.meta.env.BASE_URL}assets/${path}`;
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
const worldApp = installWorldAppBridge();
const worldIdConfig = getWorldIdConfig();
const worldBadge = worldApp.installed ? `WORLD APP${worldApp.walletAddress ? ` · ${worldApp.walletAddress.slice(0, 6)}…${worldApp.walletAddress.slice(-4)}` : " · VERBUNDEN"}` : "DEMO · LOKAL";
let worldIdStatus = worldIdConfig.testnetConfigured ? "testnet_ready" : (worldApp.installed ? (worldIdConfig.configured ? "not_verified" : "configuration_required") : "local_demo");
let worldIdError = "";
let feedback = "Wähle ein Gebäude auf dem Dorfplan.";
let selectedBuilding = "townhall";
let activePanel = "build";
let state = load();
let serverAuthoritative = false;
let onlineTargets = [];
let serverStateInitialized = false;

function anonymousBrowserId() {
  let id = localStorage.getItem(ANONYMOUS_ID_KEY);
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(id || "")) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    id = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(ANONYMOUS_ID_KEY, id);
  }
  return id;
}

async function gameApi(method, body) {
  const response = await fetch("/api/game/state", {
    method,
    headers: { "x-idlemint-anonymous-id": anonymousBrowserId(), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`game_api_${response.status}`);
  return response.json();
}

async function loadOnlineTargets() {
  const response = await fetch("/api/game/targets", { headers: { "x-idlemint-anonymous-id": anonymousBrowserId() } });
  if (!response.ok) throw new Error(`game_targets_${response.status}`);
  const body = await response.json();
  onlineTargets = Array.isArray(body.targets) ? body.targets : [];
}

function actionId() {
  return crypto.randomUUID().replaceAll("-", "");
}

async function performServerAction(type, payload, message) {
  if (!serverAuthoritative) return null;
  try {
    const response = await gameApi("POST", { id: actionId(), action: { type, payload } });
    state = response.state;
    if (type === "start_raid" || type === "resolve_raid") await loadOnlineTargets();
    feedback = message(response.result);
    render();
    return response.result;
  } catch {
    feedback = "Der Spielserver ist derzeit nicht erreichbar. Dein lokaler Browserstand wird nicht als Ersatz fortgeschrieben.";
    render();
    return null;
  }
}

async function initializeServerState() {
  if (serverStateInitialized || !hasGameAccess()) return;
  serverStateInitialized = true;
  try {
    const response = await gameApi("GET");
    state = response.state;
    serverAuthoritative = true;
    await loadOnlineTargets();
    feedback = "Online-Spielstand geladen. Aktionen werden serverseitig geprüft und gespeichert.";
    render();
  } catch {
    feedback = "Lokaler Demo-Modus: Der Spielserver ist nicht verfügbar.";
    render();
  }
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

function save() { if (!serverAuthoritative) localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function remainingTime(until) { return Math.max(0, Math.ceil((until - Date.now()) / 1000)); }
function clock(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]); }
function collectionStatus() {
  const seconds = remainingTime(state.gatherAvailableAt || 0);
  return seconds ? { locked: true, label: `Sammeln in ${clock(seconds)}`, detail: `SAMMLER KEHREN IN ${clock(seconds)} ZURÜCK` } : { locked: false, detail: "FELDLAGER · RAIDBAR" };
}

function hasGameAccess() { return canRenderGameWorld({ worldAppInstalled: worldApp.installed, worldIdStatus }); }
async function injectedWalletAddress() {
  try {
    const wallet = globalThis.ethereum;
    if (!wallet?.request) return null;
    const [address] = await wallet.request({ method: "eth_requestAccounts" });
    return address || null;
  } catch { return null; }
}
function worldIdStatusView() {
  if (worldIdConfig.testnetConfigured) {
    return `<div class="world-id-status" role="status"><b>SEPOLIA · TEST-CONTRACT</b><span>Mock World ID. Funktioniert nur mit externer EVM-Wallet auf World Chain Sepolia, nicht in World App.</span><button id="testnet-register">Testdorf on-chain registrieren</button></div>`;
  }
  if (!worldApp.installed) return "";
  const content = {
    not_verified: ["WORLD ID · NICHT VERIFIZIERT", "Bestätige den Spielzugang mit World ID."],
    checking: ["WORLD ID · PRÜFUNG LÄUFT", "World App erzeugt den Nachweis; die Registrierung wird auf World Chain geprüft."],
    verified: ["WORLD ID · REGISTRIERT", "Der Spielzugang wurde mit einer World-Chain-Transaktion registriert."],
    configuration_required: ["WORLD ID · NOCH NICHT BEREIT", "App-ID, Aktion, RP-Endpunkt und Vertragsadresse müssen gesetzt sein."],
    wallet_unavailable: ["WORLD ID · WALLET NOCH NICHT BEREIT", "Die World-Wallet konnte noch nicht geladen werden. Bitte kurz warten und erneut versuchen."],
    wallet_auth: ["WORLD WALLET · ANMELDUNG LÄUFT", "Bestätige deine Wallet in World App. Danach wird der World-ID-Nachweis angefordert."],
    wallet_auth_error: ["WORLD WALLET · ANMELDUNG FEHLGESCHLAGEN", worldIdError ? `Die Wallet-Anmeldung wurde nicht bestätigt (${escapeHtml(worldIdError)}). Bitte erneut versuchen.` : "Die Wallet-Anmeldung wurde nicht bestätigt. Bitte erneut versuchen."],
    error: ["WORLD ID · FEHLER", worldIdError ? `World-ID-Verifizierung konnte nicht gestartet werden (${escapeHtml(worldIdError)}). Bitte erneut versuchen.` : "Nachweis oder World-Chain-Transaktion wurde nicht bestätigt. Bitte erneut versuchen."],
  }[worldIdStatus];
  const canStart = canRetryWorldIdVerification(worldIdStatus);
  return `<div class="world-id-status" role="status"><b>${content[0]}</b><span>${content[1]}</span>${canStart ? "<button id=\"world-id-verify\">Mit World ID verifizieren</button>" : ""}</div>`;
}
function worldIdGateView() {
  const status = worldIdStatusView();
  return `<section class="world-id-gate" aria-labelledby="world-id-gate-title"><div class="world-id-gate-card"><span class="world-id-gate-mark">CD</span><p>WORLD MINI APP</p><h1 id="world-id-gate-title">Verifiziere dich mit World ID</h1><span>Bevor dein Dorf geöffnet wird, benötigen wir einen World-ID-v4-Nachweis und die bestätigte Registrierung auf World Chain.</span>${status}</div></section>`;
}
function bindWorldIdActions() {
  document.querySelector("#testnet-register")?.addEventListener("click", async () => {
    const walletAddress = await injectedWalletAddress();
    const registration = walletAddress ? buildTestnetRegistration({ config: worldIdConfig, walletAddress }) : null;
    const submission = await submitTestnetRegistration(registration);
    feedback = submission.ok ? `Testdorf on-chain registriert: ${submission.transaction.slice(0, 10)}…` : "Keine kompatible Sepolia-Wallet verfügbar oder Testregistrierung abgebrochen.";
    render();
  });
  document.querySelector("#world-id-verify")?.addEventListener("click", async () => {
    // Must happen before any await: the Wallet Auth prompt may be needed
    // before IDKit has produced a connector URI.
    const openConnector = reserveWorldIdConnectorWindow();
    worldIdError = "";
    worldIdStatus = "wallet_auth";
    render();
    // Do not trust MiniKit's cached address or the native response. The SIWE
    // verifier is the sole source for the address used as the World ID signal.
    const walletAuth = await authenticateWorldWallet({ proofContextEndpoint: worldIdConfig.proofContextEndpoint });
    if (!walletAuth.ok) {
      openConnector.close();
      worldIdStatus = "wallet_auth_error";
      worldIdError = walletAuth.reason;
      feedback = "World-Wallet-Anmeldung wurde abgebrochen oder nicht bestätigt. Bitte erneut versuchen.";
      render();
      return;
    }
    const walletAddress = walletAuth.walletAddress;
    worldIdError = "";
    worldIdStatus = "checking";
    render();
    const result = await requestWorldIdGameAccess({ config: worldIdConfig, walletAddress, openConnector });
    if (!result.ok) {
      openConnector.close();
      worldIdStatus = "error";
      worldIdError = result.reason;
      feedback = `World-ID-Verifizierung konnte nicht gestartet werden (${result.reason}). Bitte erneut versuchen.`;
      render();
      return;
    }
    const submission = result.ok ? await submitWorldIdRegistration(result.registration) : { ok: false };
    const confirmation = submission.ok ? await confirmWorldIdRegistration({ config: worldIdConfig, walletAddress }) : { ok: false };
    worldIdStatus = confirmation.ok ? "verified" : "error";
    feedback = confirmation.ok ? "World-ID-Spielzugang wurde auf World Chain registriert." : "World-ID-Nachweis oder Registrierung wurde nicht auf World Chain bestätigt.";
    render();
    if (confirmation.ok) initializeServerState();
  });
}
function requireWorldIdAccess() {
  if (hasGameAccess()) return true;
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
  if (!state.lastRaid) return `<div class="raid-result"><span>LETZTER BERICHT</span><b>Noch keine Truppen entsandt.</b><small>Wähle ein ${serverAuthoritative ? "Online-Dorf" : "Demo-Dorf"} und deine Marschgruppe.</small></div>`;
  const result = state.lastRaid;
  const stolen = costLine(result.stolen) || "Keine Beute";
  const losses = Object.entries(result.casualties).filter(([, amount]) => amount).map(([id, amount]) => `${amount} ${TROOPS[id].label}`).join(", ") || "Keine Verluste";
  return `<div class="raid-result ${result.ok ? "success" : "failure"}"><span>LETZTER BERICHT · ${result.ok ? "SIEG" : "RÜCKZUG"}</span><b>${escapeHtml(result.target)}: Angriff ${result.attack} gegen ${result.defense}</b><small>Feldlager-Beute: ${stolen} · Verluste: ${losses}</small></div>`;
}

function raidPanel() {
  const pending = state.pendingRaid;
  if (pending) {
    const target = (serverAuthoritative ? onlineTargets : state.targets).find((item) => item.id === pending.targetId);
    return `<div class="inspector raid-inspector"><div class="inspector-title"><p>ÜBERFALL</p><h2>Marsch unterwegs</h2><span>Kein weiterer Marsch, bis die Truppe zurück ist.</span></div><div class="march-status"><span>MARSCH NACH ${target?.name?.toUpperCase() || "ZIELORT"}</span><b data-raid-countdown>${clock(remainingTime(pending.arrivesAt))}</b><small>Die Schlacht wird bei Ankunft ausgewertet.</small></div><button class="primary-action" disabled>Marsch läuft</button>${raidResult()}</div>`;
  }
  const targets = serverAuthoritative ? onlineTargets : state.targets;
  const targetOptions = targets.map((target) => `<option value="${target.id}">${escapeHtml(target.name)} · Verteidigung ${target.defense} · Feldlager ${format(Object.values(target.unclaimed).reduce((sum, amount) => sum + amount, 0))}</option>`).join("");
  const empty = !targets.length;
  return `<div class="inspector raid-inspector"><div class="inspector-title"><p>ÜBERFALL</p><h2>Marsch planen</h2><span>${serverAuthoritative ? "Online-Dörfer · nur Feldlager raidbar" : "Lokale Demo-Gegner · nur Feldlager raidbar"}</span></div><label class="target-select">Zielort <select id="raid-target" ${empty ? "disabled" : ""}>${targetOptions || "<option>Keine Online-Dörfer verfügbar</option>"}</select></label><div class="army-inputs">${Object.entries(TROOPS).map(([id, troop]) => `<label><span>${troop.label}<b>${state.troops[id]} bereit</b></span><input type="number" min="0" max="${state.troops[id]}" value="0" id="raid-${id}" inputmode="numeric"></label>`).join("")}</div><button class="primary-action" id="send-raid" ${empty ? "disabled" : ""}>Marsch starten · 01:00</button>${raidResult()}</div>`;
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
  if (!hasGameAccess()) {
    document.querySelector("#app").innerHTML = worldIdGateView();
    bindWorldIdActions();
    return;
  }
  if (!serverAuthoritative) settle(state);
  const production = getProduction(state);
  const capacity = getCapacity(state);
  const readyToClaim = Object.values(state.unclaimed).reduce((sum, amount) => sum + amount, 0);
  const collection = collectionStatus();
  document.querySelector("#app").innerHTML = `<section class="game-shell village-shell" style="--city-map-desktop:url('${CITY_MAPS.desktop}');--city-map-mobile:url('${CITY_MAPS.mobile}')"><header class="hud village-hud"><div class="game-mark"><span>CD</span><div><b>CIVILIZATION</b><small>DAPP · DORF VON MINTIA</small></div></div><div class="resource-hud">${Object.entries(RESOURCE_DEFS).map(([id, definition]) => resourceHudItem(id, definition, production, capacity)).join("")}</div><span class="demo-badge ${worldApp.installed ? "is-world" : ""}">${worldBadge}</span></header><main class="command-layout"><section class="village-map" id="dorf" aria-label="Interaktive Stadtkarte von Mintia. Wähle ein Gebäude, um seinen Ausbau zu planen."><div class="map-head"><p>DORF VON MINTIA</p><h1>Dein Dorf.</h1><span>Rathaus ${state.buildings.townhall} · Speicher ${format(capacity)}</span></div><button class="collect-button" id="gather" ${collection.locked ? "disabled" : ""}><span data-collection-status>${collection.detail}</span><b data-ready-to-claim>${collection.locked ? collection.label : `${format(readyToClaim)} sammeln`}</b></button><div class="map-buildings">${BUILDING_IDS.map(buildingSpot).join("")}<button class="map-building map-market ${activePanel === "market" ? "is-selected" : ""}" data-panel="market" aria-label="Tauschhalle öffnen"><img src="${BUILDING_ASSETS.market}" alt=""><span><b>Tauschhalle</b><small>ERC-20 Markt</small></span></button></div><p class="map-feedback" aria-live="polite">${feedback}</p></section><aside class="command-rail"><nav class="command-tabs" aria-label="Dorfaktionen">${[["build", "Bauplan"], ["army", "Kaserne"], ["market", "Markt"], ["raid", "Überfall"]].map(([id, label]) => `<button data-panel="${id}" class="${activePanel === id ? "is-active" : ""}">${label}</button>`).join("")}</nav><section class="command-panel">${panelContents()}</section></aside></main><footer class="game-footer"><span><i></i> Speicher geschützt · Feldlager raidbar</span><span>${state.raids} Demo-Überfälle · ${worldApp.installed ? "World App erkannt" : "Kein Wallet verbunden"}</span><button id="reset">Demo zurücksetzen</button></footer><nav class="mobile-hud" aria-label="Schnellzugriff">${[["build", "Bau"], ["army", "Armee"], ["market", "Markt"], ["raid", "Überfall"]].map(([id, label]) => `<button data-panel="${id}" class="${activePanel === id ? "is-active" : ""}">${label}</button>`).join("")}</nav></section>`;

  document.querySelector("#app").insertAdjacentHTML("afterbegin", worldIdStatusView());
  bindWorldIdActions();
  document.querySelector("#gather").addEventListener("click", async () => { if (!requireWorldIdAccess()) return; if (serverAuthoritative) return performServerAction("gather", {}, (result) => !result.ok ? "Sammler sind noch unterwegs." : Object.values(result.collected).some(Boolean) ? "Im Speicher gesichert. Nächste Sammlung in 01:00." : "Feldlager leer oder Speicher voll."); const result = startGathering(state); const collected = result.ok ? costLine(result.collected) : ""; feedback = !result.ok ? "Sammler sind noch unterwegs." : collected ? `Im Speicher gesichert: ${collected}. Nächste Sammlung in 01:00.` : "Feldlager leer oder Speicher voll. Nächste Sammlung in 01:00."; save(); render(); });
  document.querySelectorAll("[data-map-building]").forEach((button) => button.addEventListener("click", () => { selectedBuilding = button.dataset.mapBuilding; activePanel = "build"; feedback = `${BUILDINGS[selectedBuilding].label} ausgewählt.`; render(); }));
  document.querySelectorAll("[data-panel]").forEach((button) => button.addEventListener("click", () => { activePanel = button.dataset.panel; feedback = { build: "Wähle ein Gebäude auf dem Dorfplan.", army: "Bilde Truppen aus, sobald die Kaserne bereit ist.", market: "Nur Holz, Lehm und Stein sind im Spielmarkt tauschbar.", raid: "Stelle eine Marschgruppe zusammen." }[activePanel]; render(); }));
  document.querySelectorAll("[data-building]").forEach((button) => button.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; const id = button.dataset.building; if (serverAuthoritative) return performServerAction("upgrade", { building: id }, (result) => result.ok ? `${BUILDINGS[id].label} ausgebaut.` : "Ausbau noch gesperrt oder Rohstoffe fehlen."); const result = upgradeBuilding(state, id); feedback = result.ok ? `${BUILDINGS[id].label} auf Stufe ${state.buildings[id]} ausgebaut.` : "Ausbau noch gesperrt oder Rohstoffe fehlen."; save(); render(); }));
  document.querySelectorAll("[data-train]").forEach((button) => button.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; const id = button.dataset.train; if (serverAuthoritative) return performServerAction("train", { troop: id, amount: 1 }, (result) => result.ok ? `${TROOPS[id].label} ausgebildet.` : "Ausbildung noch gesperrt oder Rohstoffe fehlen."); const result = trainTroop(state, id); feedback = result.ok ? `${TROOPS[id].label} ausgebildet.` : "Ausbildung noch gesperrt oder Rohstoffe fehlen."; save(); render(); }));
  document.querySelector("#market-swap")?.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; const from = document.querySelector("#market-from").value; const to = document.querySelector("#market-to").value; const amount = Number(document.querySelector("#market-amount").value); if (serverAuthoritative) return performServerAction("swap", { from, to, amount }, (result) => result.ok ? `${format(result.output)} ${RESOURCE_DEFS[to].label} im Spielmarkt erhalten.` : "Tausch nicht möglich: Quelle, Ziel, Menge oder Speicher prüfen."); const result = swapInternal(state, from, to, amount); feedback = result.ok ? `${format(result.output)} ${RESOURCE_DEFS[to].label} im Spielmarkt erhalten.` : "Tausch nicht möglich: Quelle, Ziel, Menge oder Speicher prüfen."; save(); render(); });
  document.querySelector("#send-raid")?.addEventListener("click", async () => { if (!requireWorldIdAccess()) return; const targetId = document.querySelector("#raid-target").value; const selected = Object.fromEntries(Object.keys(TROOPS).map((id) => [id, Number(document.querySelector(`#raid-${id}`).value)])); if (serverAuthoritative) return performServerAction("start_raid", { targetId, army: Object.entries(selected).map(([troop, amount]) => ({ troop, amount })) }, (result) => result.ok ? "Marsch gestartet. Ankunft in 01:00." : "Wähle verfügbare Truppen für den Überfall."); const result = startRaidMarch(state, targetId, selected); feedback = result.ok ? "Marsch gestartet. Ankunft in 01:00." : "Wähle verfügbare Truppen für den Überfall."; save(); render(); });
  document.querySelector("#reset").addEventListener("click", async () => { selectedBuilding = "townhall"; activePanel = "build"; if (serverAuthoritative) return performServerAction("reset", {}, () => "Online-Dorf zurückgesetzt."); state = createInitialState(); feedback = "Demo-Dorf zurückgesetzt."; localStorage.removeItem(STORAGE_KEY); render(); });
}

render();
if (hasGameAccess()) initializeServerState();
setInterval(() => {
  if (!hasGameAccess()) return;
  if (serverAuthoritative) {
    if (state.pendingRaid && Date.now() >= state.pendingRaid.arrivesAt) performServerAction("resolve_raid", {}, (result) => result.ok ? "Marsch beendet." : "Marsch wird noch ausgewertet.");
    else refreshTickValues();
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
