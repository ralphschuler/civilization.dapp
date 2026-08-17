import {
  RESOURCE_DEFS,
  TROOPS,
  createInitialState,
  format,
  resolveRaidMarch,
  startGathering,
  startRaidMarch,
  swapInternal,
  trainTroop,
  upgradeBuilding,
} from "./game.js";
import { clearDemoState, saveDemoState } from "./demo/storage.js";
import { costLine } from "./game-ui/helpers.js";

export function createGameActions(runtime, services) {
  const { render, requireAccess, performWorldAction, errorText, isCurrent } =
    services;
  const save = () => {
    if (runtime.mode === "demo") saveDemoState(runtime.state);
  };
  const demo = (operation, success, failure) => {
    const result = operation();
    runtime.feedback = result.ok ? success(result) : failure;
    save();
    render();
  };

  return {
    troopIds: Object.keys(TROOPS),
    retry: () => services.refreshWorld(),
    selectBuilding(id) {
      runtime.selectedBuilding = id;
      runtime.activePanel = "build";
      runtime.feedback = `${services.buildings[id].label} ausgewählt.`;
      render();
    },
    selectPanel(id) {
      runtime.activePanel = id;
      runtime.feedback = {
        build: "Wähle ein Gebäude auf dem Dorfplan.",
        army: "Bilde Truppen aus, sobald die Kaserne bereit ist.",
        market:
          runtime.mode === "world"
            ? "Lade eine Live-Quote; der Contract erzwingt Preis, Liquidität, Slippage und Ablaufzeit."
            : "Nur Holz, Lehm und Stein sind im Demo-Markt tauschbar.",
        raid: "Stelle eine Marschgruppe zusammen.",
      }[id];
      render();
    },
    gather() {
      if (!requireAccess()) return;
      if (runtime.mode === "world") {
        return performWorldAction(
          "claim",
          {},
          "Feldressourcen im Contract gesichert. Nächste Sammlung nach 01:00.",
        );
      }
      return demo(
        () => startGathering(runtime.state),
        (result) =>
          result.collected
            ? `Im Speicher gesichert: ${costLine(result.collected, RESOURCE_DEFS, format)}. Nächste Sammlung in 01:00.`
            : "Feldlager leer oder Speicher voll. Nächste Sammlung in 01:00.",
        "Sammler sind noch unterwegs.",
      );
    },
    upgrade(id) {
      if (!requireAccess()) return;
      if (runtime.mode === "world") {
        return performWorldAction(
          "upgrade",
          { building: id },
          `${services.buildings[id].label}-Ausbau gestartet.`,
        );
      }
      return demo(
        () => upgradeBuilding(runtime.state, id),
        () =>
          `${services.buildings[id].label} auf Stufe ${runtime.state.buildings[id]} ausgebaut.`,
        "Ausbau noch gesperrt oder Rohstoffe fehlen.",
      );
    },
    completeUpgrade: () =>
      requireAccess() &&
      performWorldAction(
        "complete_upgrade",
        {},
        "Ausbau on-chain abgeschlossen.",
      ),
    boost: () =>
      requireAccess() &&
      performWorldAction(
        "boost",
        { hours: 1 },
        "Bauzeit um 1 Stunde reduziert; 1 WLD ging direkt an den Revenue Splitter.",
      ),
    prestige: () =>
      requireAccess() &&
      performWorldAction(
        "prestige",
        {},
        "Prestige abgeschlossen. Dorf zurückgesetzt, Produktionsbonus erhöht.",
      ),
    train(id) {
      if (!requireAccess()) return;
      if (runtime.mode === "world") {
        return performWorldAction(
          "train",
          { troop: id, amount: 1 },
          `${TROOPS[id].label} on-chain ausgebildet.`,
        );
      }
      return demo(
        () => trainTroop(runtime.state, id),
        () => `${TROOPS[id].label} ausgebildet.`,
        "Ausbildung noch gesperrt oder Rohstoffe fehlen.",
      );
    },
    swap(from, to, amount) {
      if (runtime.mode !== "demo") return;
      return demo(
        () => swapInternal(runtime.state, from, to, amount),
        (result) =>
          `${format(result.output)} ${RESOURCE_DEFS[to].label} im Demo-Markt erhalten.`,
        "Tausch nicht möglich: Quelle, Ziel, Menge oder Speicher prüfen.",
      );
    },
    async quoteMarket(resource, amount) {
      if (!requireAccess() || runtime.mode !== "world") return;
      if (!Number.isSafeInteger(amount) || amount < 1) {
        runtime.feedback = "Bitte eine ganze Rohstoffmenge ab 1 eingeben.";
        render();
        return;
      }
      const token = runtime.token;
      runtime.busy = true;
      runtime.feedback = "Live-Quote und Contract-Liquidität werden gelesen.";
      render();
      try {
        runtime.marketQuote = await runtime.adapter.quoteMarket(
          resource,
          amount,
        );
        if (isCurrent(token))
          runtime.feedback =
            "Live-Quote geladen. Prüfe Preis, Gebühr und Liquidität vor der Bestätigung.";
      } catch (error) {
        if (isCurrent(token)) runtime.feedback = errorText(error);
      } finally {
        if (!isCurrent(token)) return;
        runtime.busy = false;
        render();
      }
    },
    marketOrder(side) {
      if (!requireAccess() || runtime.mode !== "world") return;
      const quote = runtime.marketQuote;
      if (!quote || (side !== "buy" && side !== "sell")) {
        runtime.feedback = "Lade zuerst eine aktuelle Live-Quote.";
        render();
        return;
      }
      return performWorldAction(
        side === "buy" ? "market_buy" : "market_sell",
        {
          resource: quote.resource,
          amount: quote.amount,
          limit: side === "buy" ? quote.buyGoldIn : quote.sellGoldOut,
          deadline: quote.deadline,
        },
        side === "buy"
          ? "Rohstoffe atomar gegen CGOLD gekauft."
          : "Rohstoffe atomar gegen CGOLD verkauft.",
      );
    },
    async pickOpponent() {
      if (!requireAccess()) return;
      const token = runtime.token;
      runtime.busy = true;
      runtime.feedback = "Öffne deine World-Kontakte.";
      render();
      try {
        const opponent = await runtime.adapter.pickOpponent();
        if (!isCurrent(token)) return;
        runtime.selectedOpponent = opponent;
        runtime.feedback = `${opponent.username} als Ziel gewählt.`;
      } catch (error) {
        if (isCurrent(token)) runtime.feedback = errorText(error);
      } finally {
        if (!isCurrent(token)) return;
        runtime.busy = false;
        render();
      }
    },
    sendRaid(targetId, army) {
      if (!requireAccess()) return;
      if (runtime.mode === "world") {
        return performWorldAction(
          "start_raid",
          { targetId, army },
          "Marsch on-chain gestartet. Ankunft in 01:00.",
        );
      }
      return demo(
        () => startRaidMarch(runtime.state, targetId, army),
        () => "Marsch gestartet. Ankunft in 01:00.",
        "Wähle verfügbare Truppen für den Überfall.",
      );
    },
    resolveRaid: () =>
      requireAccess() &&
      performWorldAction("resolve_raid", {}, "Schlacht on-chain ausgewertet."),
    reset() {
      if (runtime.mode !== "demo") return;
      runtime.state = createInitialState();
      runtime.selectedBuilding = "townhall";
      runtime.activePanel = "build";
      runtime.feedback = "Demo-Dorf zurückgesetzt.";
      clearDemoState();
      render();
    },
    resolveDemoRaid() {
      const result = resolveRaidMarch(runtime.state);
      runtime.feedback = result.ok
        ? `Marsch beendet: ${result.attack >= result.defense ? "Sieg" : "Rückzug"}.`
        : "Marsch konnte nicht ausgewertet werden.";
      save();
      render();
    },
  };
}
