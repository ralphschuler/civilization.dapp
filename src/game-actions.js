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
import { marketPrefill } from "./world-game/market-intent.js";

export function createGameActions(runtime, services) {
  const {
    render,
    requireAccess,
    requestWorldAction,
    confirmWorldReview,
    cancelWorldReview,
    errorText,
    isCurrent,
    copy,
    buildingLabel,
    resourceDefs,
    numberFormat,
  } = services;
  const review = (type, payload, success, details) =>
    requestWorldAction(type, payload, success, details);
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
    confirmReview() {
      const intent = runtime.review.state().intent;
      if (!intent) return;
      const success = {
        claim: copy().feedback.worldClaim,
        upgrade: copy().feedback.worldUpgradeStarted(
          buildingLabel(intent.payload.building),
        ),
        complete_upgrade: copy().feedback.worldUpgradeComplete,
        boost: copy().feedback.worldBoost,
        prestige: copy().feedback.worldPrestige,
        train: copy().feedback.worldTrainingComplete(
          copy().troopNames[intent.payload.troop],
        ),
        market_buy: copy().feedback.marketBuyComplete,
        market_sell: copy().feedback.marketSellComplete,
        start_raid: copy().feedback.worldRaidStarted,
        resolve_raid: copy().feedback.worldRaidResolved,
      }[intent.type];
      return confirmWorldReview(success);
    },
    cancelReview: () => cancelWorldReview(),
    marketInputsChanged(changes) {
      runtime.marketDraft = { ...runtime.marketDraft, ...changes };
      runtime.marketInputRevision += 1;
      runtime.marketQuote = null;
      runtime.review.invalidate("market_inputs_changed");
      if (runtime.review.state().status === "invalidated")
        runtime.feedback = copy().feedback.reviewInvalidated;
      render();
    },
    openMarket(intent) {
      const prefill = marketPrefill({ [intent?.resource]: intent?.amount });
      if (!prefill) return;
      runtime.marketDraft = { ...runtime.marketDraft, ...prefill };
      runtime.marketInputRevision += 1;
      runtime.marketQuote = null;
      runtime.marketOrigin = {
        source: typeof intent.source === "string" ? intent.source : "",
        panel: intent.panel === "army" ? "army" : "build",
        ...prefill,
      };
      runtime.review.invalidate("market_inputs_changed");
      runtime.activePanel = "market";
      runtime.feedback = copy().feedback.marketPrefilled(
        numberFormat(prefill.amount),
        copy().resourceNames[prefill.resource],
      );
      render();
    },
    raidInputsChanged(changes) {
      runtime.raidDraft = { ...runtime.raidDraft, ...changes };
      render();
    },
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
        return review("claim", {}, copy().feedback.worldClaim, [
          "Claim field resources",
        ]);
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
        return review(
          "upgrade",
          { building: id },
          copy().feedback.worldUpgradeStarted(buildingLabel(id)),
          [`Upgrade ${buildingLabel(id)}`],
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
    completeUpgrade: (slot) =>
      requireAccess() &&
      review(
        "complete_upgrade",
        // Keep slot zero on the original no-argument ABI. Parallel slots are
        // addressed explicitly by the V2 overload.
        Number.isInteger(slot) && slot > 0 ? { slot } : {},
        copy().feedback.worldUpgradeComplete,
        [
          Number.isInteger(slot)
            ? `Complete construction slot ${slot + 1}`
            : "Complete active construction",
        ],
      ),
    boost: (slot) =>
      requireAccess() &&
      review(
        "boost",
        Number.isInteger(slot) && slot > 0 ? { hours: 1, slot } : { hours: 1 },
        copy().feedback.worldBoost,
        ["Spend 1 WLD to reduce construction by 1 hour"],
      ),
    prestige: () =>
      requireAccess() &&
      review("prestige", {}, copy().feedback.worldPrestige, [
        "Reset village for the next prestige",
      ]),
    train(id) {
      if (!requireAccess()) return;
      if (runtime.mode === "world") {
        return review(
          "train",
          { troop: id, amount: 1 },
          copy().feedback.worldTrainingComplete(copy().troopNames[id]),
          [`Train 1 ${copy().troopNames[id]}`],
        );
      }
      return demo(
        () => trainTroop(runtime.state, id),
        () => copy().feedback.demoTrainingComplete(copy().troopNames[id]),
        copy().feedback.trainingUnavailable,
      );
    },
    swap() {
      if (runtime.mode !== "demo") return;
      return demo(
        () =>
          swapInternal(
            runtime.state,
            runtime.marketDraft.from,
            runtime.marketDraft.to,
            runtime.marketDraft.amount,
          ),
        (result) =>
          copy().feedback.demoSwapComplete(
            numberFormat(result.output),
            copy().resourceNames[runtime.marketDraft.to],
          ),
        copy().feedback.demoSwapUnavailable,
      );
    },
    async quoteMarket() {
      if (!requireAccess() || runtime.mode !== "world") return;
      const { resource, amount } = runtime.marketDraft;
      if (!Number.isSafeInteger(amount) || amount < 1) {
        runtime.feedback = copy().feedback.marketAmountInvalid;
        render();
        return;
      }
      const token = runtime.token;
      const inputRevision = runtime.marketInputRevision;
      runtime.busy = true;
      runtime.feedback = copy().feedback.marketQuoteLoading;
      render();
      try {
        const quote = await runtime.adapter.quoteMarket(resource, amount);
        if (
          isCurrent(token) &&
          runtime.marketInputRevision === inputRevision &&
          runtime.marketDraft.resource === resource &&
          runtime.marketDraft.amount === amount
        ) {
          runtime.marketQuote = quote;
          runtime.feedback = copy().feedback.marketQuoteLoaded;
        }
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
      if (
        !quote ||
        quote.resource !== runtime.marketDraft.resource ||
        quote.amount !== runtime.marketDraft.amount ||
        (side !== "buy" && side !== "sell")
      ) {
        runtime.feedback = copy().feedback.marketQuoteRequired;
        render();
        return;
      }
      return review(
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
        [
          `${side === "buy" ? "Buy" : "Sell"} ${quote.amount} ${copy().resourceNames[quote.resource]}`,
          `Limit: ${String(side === "buy" ? quote.buyGoldIn : quote.sellGoldOut)} CGOLD`,
          `Quote expires: ${new Date(quote.deadline * 1000).toLocaleTimeString()}`,
        ],
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
        runtime.raidDraft = {
          ...runtime.raidDraft,
          targetAddress: opponent.address,
        };
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
        return review(
          "start_raid",
          { targetId, army },
          copy().feedback.worldRaidStarted,
          [
            `Target: ${targetId}`,
            `Army: ${Object.entries(army)
              .map(([id, amount]) => `${amount} ${copy().troopNames[id]}`)
              .join(", ")}`,
          ],
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
      review("resolve_raid", {}, copy().feedback.worldRaidResolved, [
        "Resolve the arrived raid",
      ]),
    reset() {
      if (runtime.mode !== "demo") return;
      runtime.state = createInitialState();
      runtime.raidDraft = {
        army: Object.fromEntries(Object.keys(TROOPS).map((id) => [id, 0])),
        targetAddress: "",
        targetId: "",
      };
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
