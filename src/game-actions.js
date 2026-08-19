import {
  TROOPS,
  createInitialState,
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
  const {
    render,
    requireAccess,
    performWorldAction,
    errorText,
    isCurrent,
    copy,
    buildingLabel,
    resourceDefs,
    numberFormat,
  } = services;
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
    changeLocale: (locale) => services.changeLocale?.(locale),
    openSettings: () => services.openSettings?.(),
    closeSettings: () => services.closeSettings?.(),
    setReducedMotion: (enabled) => services.setReducedMotion?.(enabled),
    logout: () => services.logout?.(),
    selectBuilding(id) {
      runtime.selectedBuilding = id;
      runtime.activePanel = "build";
      runtime.feedback = copy().feedback.buildingSelected(buildingLabel(id));
      render();
    },
    selectPanel(id) {
      runtime.activePanel = id;
      runtime.feedback = {
        build: copy().chooseBuilding,
        army: copy().feedback.panelArmy,
        market:
          runtime.mode === "world"
            ? copy().feedback.panelWorldMarket
            : copy().feedback.panelDemoMarket,
        raid: copy().feedback.panelRaid,
      }[id];
      render();
    },
    gather() {
      if (!requireAccess()) return;
      if (runtime.mode === "world") {
        return performWorldAction("claim", {}, copy().feedback.worldClaim);
      }
      return demo(
        () => startGathering(runtime.state),
        (result) =>
          result.collected
            ? copy().feedback.demoClaim(
                costLine(result.collected, resourceDefs(), numberFormat),
              )
            : copy().feedback.demoClaimEmpty,
        copy().feedback.collectorsEnRoute,
      );
    },
    upgrade(id) {
      if (!requireAccess()) return;
      if (runtime.mode === "world") {
        return performWorldAction(
          "upgrade",
          { building: id },
          copy().feedback.worldUpgradeStarted(buildingLabel(id)),
        );
      }
      return demo(
        () => upgradeBuilding(runtime.state, id),
        () =>
          copy().feedback.demoUpgradeComplete(
            buildingLabel(id),
            runtime.state.buildings[id],
          ),
        copy().feedback.upgradeUnavailable,
      );
    },
    completeUpgrade: () =>
      requireAccess() &&
      performWorldAction(
        "complete_upgrade",
        {},
        copy().feedback.worldUpgradeComplete,
      ),
    boost: () =>
      requireAccess() &&
      performWorldAction("boost", { hours: 1 }, copy().feedback.worldBoost),
    prestige: () =>
      requireAccess() &&
      performWorldAction("prestige", {}, copy().feedback.worldPrestige),
    train(id) {
      if (!requireAccess()) return;
      if (runtime.mode === "world") {
        return performWorldAction(
          "train",
          { troop: id, amount: 1 },
          copy().feedback.worldTrainingComplete(copy().troopNames[id]),
        );
      }
      return demo(
        () => trainTroop(runtime.state, id),
        () => copy().feedback.demoTrainingComplete(copy().troopNames[id]),
        copy().feedback.trainingUnavailable,
      );
    },
    swap(from, to, amount) {
      if (runtime.mode !== "demo") return;
      return demo(
        () => swapInternal(runtime.state, from, to, amount),
        (result) =>
          copy().feedback.demoSwapComplete(
            numberFormat(result.output),
            copy().resourceNames[to],
          ),
        copy().feedback.demoSwapUnavailable,
      );
    },
    async quoteMarket(resource, amount) {
      if (!requireAccess() || runtime.mode !== "world") return;
      if (!Number.isSafeInteger(amount) || amount < 1) {
        runtime.feedback = copy().feedback.marketAmountInvalid;
        render();
        return;
      }
      const token = runtime.token;
      runtime.busy = true;
      runtime.feedback = copy().feedback.marketQuoteLoading;
      render();
      try {
        runtime.marketQuote = await runtime.adapter.quoteMarket(
          resource,
          amount,
        );
        if (isCurrent(token))
          runtime.feedback = copy().feedback.marketQuoteLoaded;
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
        runtime.feedback = copy().feedback.marketQuoteRequired;
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
          ? copy().feedback.marketBuyComplete
          : copy().feedback.marketSellComplete,
      );
    },
    async pickOpponent() {
      if (!requireAccess()) return;
      const token = runtime.token;
      runtime.busy = true;
      runtime.feedback = copy().feedback.opponentPickerOpening;
      render();
      try {
        const opponent = await runtime.adapter.pickOpponent();
        if (!isCurrent(token)) return;
        runtime.selectedOpponent = opponent;
        runtime.feedback = copy().feedback.opponentSelected(opponent.username);
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
          copy().feedback.worldRaidStarted,
        );
      }
      return demo(
        () => startRaidMarch(runtime.state, targetId, army),
        () => copy().feedback.demoRaidStarted,
        copy().feedback.raidArmyRequired,
      );
    },
    resolveRaid: () =>
      requireAccess() &&
      performWorldAction("resolve_raid", {}, copy().feedback.worldRaidResolved),
    reset() {
      if (runtime.mode !== "demo") return;
      runtime.state = createInitialState();
      runtime.selectedBuilding = "townhall";
      runtime.activePanel = "build";
      runtime.feedback = copy().feedback.demoReset;
      clearDemoState();
      render();
    },
    resolveDemoRaid() {
      const result = resolveRaidMarch(runtime.state);
      runtime.feedback = result.ok
        ? copy().feedback.demoRaidResolved(
            result.attack >= result.defense ? copy().victory : copy().retreat,
          )
        : copy().feedback.demoRaidUnavailable;
      save();
      render();
    },
  };
}
