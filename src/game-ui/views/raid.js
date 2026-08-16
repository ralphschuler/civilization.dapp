import { clock, costLine, escapeHtml } from "../helpers.js";

function raidReport({ state, troops, resourceDefs, format, runtimeMode }) {
  if (!state.lastRaid) {
    const targetDescription =
      runtimeMode === "world"
        ? "einen World-Kontakt oder eine registrierte Wallet"
        : "ein Demo-Dorf";

    return `<div class="raid-result">
      <span>LETZTER BERICHT</span>
      <b>Noch keine Truppen entsandt.</b>
      <small>Wähle ${targetDescription} und deine Marschgruppe.</small>
    </div>`;
  }

  const result = state.lastRaid;
  const losses =
    Object.entries(result.casualties)
      .filter(([, amount]) => amount)
      .map(([id, amount]) => `${amount} ${troops[id].label}`)
      .join(", ") || "Keine Verluste";
  const resultClass = result.ok ? "success" : "failure";
  const resultLabel = result.ok ? "SIEG" : "RÜCKZUG";
  const loot = costLine(result.stolen, resourceDefs, format) || "Keine Beute";

  return `<div class="raid-result ${resultClass}">
    <span>LETZTER BERICHT · ${resultLabel}</span>
    <b>${escapeHtml(result.target)}: Angriff ${result.attack} gegen ${result.defense}</b>
    <small>Feldlager-Beute: ${loot} · Verluste: ${losses}</small>
  </div>`;
}

function armyInputs(state, troops) {
  return Object.entries(troops)
    .map(
      ([id, troop]) => `<label>
      <span>${troop.label}<b>${state.troops[id]} bereit</b></span>
      <input type="number" min="0" max="${state.troops[id]}" value="0" id="raid-${id}" inputmode="numeric">
    </label>`,
    )
    .join("");
}

function pendingTargetName(state, runtimeMode) {
  if (runtimeMode === "demo") {
    const target = state.targets.find(
      (item) => item.id === state.pendingRaid.targetId,
    );
    return target?.name || "Zielort";
  }
  if (runtimeMode === "world") {
    const targetId = state.pendingRaid.targetId;
    return `${targetId.slice(0, 6)}…${targetId.slice(-4)}`;
  }
  return "Zielort";
}

function pendingRaidPanel(context) {
  const { state, runtimeMode, busy, remainingTime } = context;
  const seconds = remainingTime(state.pendingRaid.arrivesAt);
  const targetName = pendingTargetName(state, runtimeMode);
  const worldResolutionNote =
    "Die Auflösung benötigt danach deine ausdrückliche Wallet-Bestätigung.";
  const demoResolutionNote = "Die Schlacht wird bei Ankunft ausgewertet.";
  const resolutionNote =
    runtimeMode === "world" ? worldResolutionNote : demoResolutionNote;
  const action =
    runtimeMode === "world"
      ? `<button class="primary-action" id="resolve-raid" ${seconds || busy ? "disabled" : ""}>${seconds ? "Marsch läuft" : "Schlacht auswerten"}</button>`
      : '<button class="primary-action" disabled>Marsch läuft</button>';

  return `<div class="inspector raid-inspector">
    <div class="inspector-title">
      <p>ÜBERFALL</p>
      <h2>Marsch unterwegs</h2>
      <span>Kein weiterer Marsch, bis die Truppe zurück ist.</span>
    </div>
    <div class="march-status">
      <span>MARSCH NACH ${escapeHtml(targetName.toUpperCase())}</span>
      <b data-raid-countdown>${clock(seconds)}</b>
      <small>${resolutionNote}</small>
    </div>
    ${action}
    ${raidReport(context)}
  </div>`;
}

function selectedContact(selectedOpponent) {
  if (!selectedOpponent) {
    return "";
  }

  return `<div class="requirement-box">
    <span>GEWÄHLTER KONTAKT</span>
    <b>${escapeHtml(selectedOpponent.username)}</b>
    <small>${escapeHtml(selectedOpponent.address)}</small>
  </div>`;
}

function worldRaidPanel(context) {
  const { state, troops, busy, selectedOpponent } = context;
  const selectedContactMarkup = selectedContact(selectedOpponent);

  return `<div class="inspector raid-inspector">
    <div class="inspector-title">
      <p>ÜBERFALL</p>
      <h2>Marsch planen</h2>
      <span>On-chain-Dorf · nur Feldbestand raidbar</span>
    </div>
    ${selectedContactMarkup}
    <button class="primary-action" id="pick-raid-contact" ${busy ? "disabled" : ""}>World-Kontakt wählen</button>
    <label class="target-select">
      Oder Wallet-Adresse
      <input id="raid-target-address" type="text" value="${escapeHtml(selectedOpponent?.address || "")}" placeholder="0x…" autocomplete="off">
    </label>
    <div class="army-inputs">${armyInputs(state, troops)}</div>
    <button class="primary-action" id="send-raid" ${busy ? "disabled" : ""}>Marsch starten · 01:00</button>
    ${raidReport(context)}
  </div>`;
}

function demoTargetOptions(state, format) {
  return state.targets
    .map((target) => {
      const fieldStock = Object.values(target.unclaimed).reduce(
        (total, amount) => total + amount,
        0,
      );
      return `<option value="${target.id}">${escapeHtml(target.name)} · Verteidigung ${target.defense} · Feldlager ${format(fieldStock)}</option>`;
    })
    .join("");
}

function demoRaidPanel(context) {
  const { state, troops, format } = context;
  const options = demoTargetOptions(state, format);
  const isUnavailable = state.targets.length === 0;

  return `<div class="inspector raid-inspector">
    <div class="inspector-title">
      <p>ÜBERFALL</p>
      <h2>Marsch planen</h2>
      <span>Lokale Demo-Gegner · nur Feldlager raidbar</span>
    </div>
    <label class="target-select">
      Zielort
      <select id="raid-target" ${isUnavailable ? "disabled" : ""}>${options || "<option>Keine Demo-Dörfer verfügbar</option>"}</select>
    </label>
    <div class="army-inputs">${armyInputs(state, troops)}</div>
    <button class="primary-action" id="send-raid" ${isUnavailable ? "disabled" : ""}>Marsch starten · 01:00</button>
    ${raidReport(context)}
  </div>`;
}

export function raidPanel(context) {
  if (context.state.pendingRaid) {
    return pendingRaidPanel(context);
  }
  if (context.runtimeMode === "world") {
    return worldRaidPanel(context);
  }
  return demoRaidPanel(context);
}
