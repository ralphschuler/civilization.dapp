import "./styles.css";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { GameShellHud } from "./components/GameShellHud";
import { VillageMap } from "./components/VillageMap";
import { BuildPanel } from "./components/BuildPanel";
import { ArmyPanel } from "./components/ArmyPanel";
import { MarketPanel } from "./components/MarketPanel";
import { RaidPanel } from "./components/RaidPanel";
import { CommandNavigation } from "./components/CommandNavigation";
import { EntryGuide } from "./components/EntryGuide";
import { SettingsDialog } from "./components/SettingsDialog";
import { WalletReviewDialog } from "./components/WalletReviewDialog";
import { GameFooter } from "./components/GameFooter";
import { canRenderGameWorld } from "./world-gate.js";
import {
  BUILDINGS,
  RESOURCE_DEFS,
  TOKEN_REGISTRY,
  TROOPS,
  format,
  getBuildingCost,
  getCapacity,
  getProduction,
  getRequirements,
  settle,
} from "./game.js";
import { loadDemoState, saveDemoState } from "./demo/storage.js";
import { MAX_BUILDING_LEVEL } from "./game-ui/constants.js";
import { deriveEntryGuide } from "./game-ui/next-action.js";
import { loadCriticalAssets } from "./game-ui/assets.js";
import { clock, remainingTime } from "./game-ui/helpers.js";
import { buildPanel } from "./game-ui/views/build.js";
import { armyPanel } from "./game-ui/views/army.js";
import { marketPanel } from "./game-ui/views/market.js";
import { raidPanel } from "./game-ui/views/raid.js";
import { gameShell } from "./game-ui/views/shell.js";
import { bindGameActions } from "./game-ui/bindings.js";
import {
  createGateRetryHandle,
  deriveGateState,
} from "./game-ui/gate-state.js";
import { createGameActions } from "./game-actions.js";
import { createWorldRuntime } from "./game-world-runtime.js";
import { createWalletReview } from "./world-game/review.js";
import { planBuildingDependencies } from "./world-game/build-planner.js";
import {
  civilizationMessages,
  formatCivilizationNumber,
} from "./lib/civilization-locale.ts";

let activeRuntime = null;

function errorText(error, locale) {
  const reason = error instanceof Error ? error.message : "transaction_failed";
  const errors = civilizationMessages(locale).actionErrors;
  return errors[reason] || errors.default(reason);
}

function createRuntime(options) {
  const installed = Boolean(options.worldAppInstalled);
  const walletAddress = options.worldWalletAddress || null;
  return {
    token: Symbol("civilization-runtime"),
    root: options.root,
    mode: options.runtimeMode,
    adapter: options.worldAdapter,
    walletAddress,
    state: options.runtimeMode === "demo" ? loadDemoState() : null,
    ready: options.runtimeMode === "demo",
    loading: options.runtimeMode === "world",
    busy: false,
    review: createWalletReview(),
    refreshing: false,
    refreshTicks: 0,
    worldStateEpoch: 0,
    durations: new Map(),
    marketQuote: null,
    marketDraft:
      options.runtimeMode === "world"
        ? { resource: "wood", from: "wood", to: "clay", amount: 1 }
        : { resource: "wood", from: "wood", to: "clay", amount: 25 },
    marketInputRevision: 0,
    marketOrigin: null,
    raidDraft: {
      army: Object.fromEntries(Object.keys(TROOPS).map((id) => [id, 0])),
      targetAddress: "",
      targetId: "",
    },
    selectedOpponent: null,
    selectedBuilding: "townhall",
    activePanel: "build",
    locale: options.locale || "de-DE",
    onLocaleChange: options.onLocaleChange,
    onLogout: options.onLogout,
    onGateStateChange: options.onGateStateChange,
    retryGate: null,
    settingsOpen: false,
    reducedMotion:
      typeof window !== "undefined" &&
      window.localStorage.getItem("civilization-reduced-motion") === "true",
    feedback:
      options.initialFeedback ??
      (options.runtimeMode === "world"
        ? civilizationMessages(options.locale).loadingState
        : civilizationMessages(options.locale).chooseBuilding),
    worldApp: installed
      ? { installed: true, walletAddress }
      : { installed: false },
    walletAccessConfirmed: installed
      ? Boolean(options.worldAccessConfirmed)
      : true,
    worldBadge: installed
      ? `${civilizationMessages(options.locale).worldAppBadge}${walletAddress ? ` · ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : ` · ${civilizationMessages(options.locale).worldAppConnected}`}`
      : civilizationMessages(options.locale).demoLocal,
    timer: null,
    visibilityHandler: null,
    assetState: "loading",
    assetResult: { failed: [] },
    hudRoot: null,
    footerRoot: null,
    desktopNavigationRoot: null,
    mobileNavigationRoot: null,
    villageMapRoot: null,
    buildPanelRoot: null,
    armyPanelRoot: null,
    marketPanelRoot: null,
    raidPanelRoot: null,
    settingsDialogRoot: null,
    entryGuideRoot: null,
    entryGuideDismissed: false,
  };
}

function isRuntimeCurrent(runtime, token = runtime.token) {
  return (
    activeRuntime === runtime &&
    runtime.token === token &&
    runtime.root !== null
  );
}

function hasAccess(runtime) {
  return (
    runtime.mode === "demo" ||
    canRenderGameWorld({
      worldAppInstalled: runtime.worldApp.installed,
      walletAccessConfirmed: runtime.walletAccessConfirmed,
    })
  );
}

function createController(runtime) {
  const isCurrent = (token) => isRuntimeCurrent(runtime, token);
  const now = () => {
    const usesPerformanceAnchor =
      runtime.mode === "world" &&
      runtime.state?.accrual?.asOf &&
      Number.isFinite(runtime.state.performanceAnchor);

    if (usesPerformanceAnchor) {
      return (
        runtime.state.accrual.asOf +
        Math.max(0, performance.now() - runtime.state.performanceAnchor)
      );
    }
    return Date.now();
  };
  const remaining = (until) => remainingTime(until, now());
  const production = () =>
    runtime.mode === "world"
      ? runtime.adapter.getProduction(runtime.state)
      : getProduction(runtime.state);
  const capacity = () =>
    runtime.mode === "world"
      ? runtime.adapter.getCapacity(runtime.state)
      : getCapacity(runtime.state);
  const resourceFormat = (value) => {
    if (runtime.mode === "world") {
      return formatCivilizationNumber(value, runtime.locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return formatCivilizationNumber(value, runtime.locale, {
      maximumFractionDigits: value < 100 ? 1 : 0,
    });
  };
  const collection = () => {
    const seconds = remaining(runtime.state.gatherAvailableAt || 0);
    if (
      runtime.mode === "world" &&
      !runtime.adapter.claimEligibility(runtime.state)
    ) {
      return {
        locked: true,
        label: civilizationMessages(runtime.locale).notTransferable,
        detail: civilizationMessages(runtime.locale).contractCheck,
      };
    }
    if (seconds) {
      return {
        locked: true,
        label: civilizationMessages(runtime.locale).collectingIn(
          clock(seconds),
        ),
        detail: civilizationMessages(runtime.locale).collectorsReturn(
          clock(seconds),
        ),
      };
    }
    return {
      locked: false,
      detail: civilizationMessages(runtime.locale).fieldRaidable,
    };
  };
  const requireAccess = () => {
    if (
      hasAccess(runtime) &&
      (runtime.mode === "demo" || (runtime.ready && !runtime.busy))
    ) {
      return true;
    }
    runtime.feedback = civilizationMessages(runtime.locale).accessDenied;
    render();
    return false;
  };

  let world;
  const focusCommandPanel = () => {
    const commandPanel = runtime.root?.querySelector("#game-command-panel");
    if (!(commandPanel instanceof HTMLElement)) return;
    // The panel is a programmatic focus destination after a mobile navigation
    // choice. Keep it out of the tab order while allowing the browser to
    // reveal the newly selected command content.
    commandPanel.tabIndex = -1;
    commandPanel.focus({ preventScroll: true });
    commandPanel.scrollIntoView({
      behavior: "auto",
      block: "start",
      inline: "nearest",
    });
    // The HUD is sticky, so its rendered height depends on the current
    // viewport and resource layout. Move the panel below its actual bottom
    // edge instead of coupling mobile navigation to a guessed HUD height.
    const hud = runtime.root?.querySelector(".hud");
    if (!(hud instanceof HTMLElement)) return;
    const panelTop = commandPanel.getBoundingClientRect().top;
    const hudBottom = hud.getBoundingClientRect().bottom;
    if (panelTop < hudBottom) window.scrollBy({ top: panelTop - hudBottom });
  };
  const isMobileNavigationVisible = () => {
    const mobileNavigation = runtime.root?.querySelector(
      '[data-game-command-navigation="mobile"]',
    );
    return (
      mobileNavigation instanceof HTMLElement &&
      window.getComputedStyle(mobileNavigation).display !== "none"
    );
  };
  const renderNavigation = () => {
    ["desktop", "mobile"].forEach((navigation) => {
      const mount = runtime.root?.querySelector(
        `[data-game-command-navigation-mount="${navigation}"]`,
      );
      if (!mount) return;
      const rootKey =
        navigation === "mobile"
          ? "mobileNavigationRoot"
          : "desktopNavigationRoot";
      runtime[rootKey] ??= createRoot(mount);
      runtime[rootKey].render(
        createElement(CommandNavigation, {
          activePanel: runtime.activePanel,
          copy: civilizationMessages(runtime.locale),
          mobile: navigation === "mobile",
          onSelectPanel: (panel, selectedNavigation) => {
            actions.selectPanel(panel);
            requestAnimationFrame(() => {
              if (selectedNavigation === "mobile") {
                focusCommandPanel();
                return;
              }
              runtime.root
                ?.querySelector(
                  `[data-game-command-navigation="${selectedNavigation}"] [data-command-panel="${panel}"]`,
                )
                ?.focus();
            });
          },
        }),
      );
    });
  };
  const renderHud = () => {
    const hud = runtime.root?.querySelector("[data-game-shell-hud]");
    if (!hud) return;
    runtime.hudRoot ??= createRoot(hud);
    runtime.hudRoot.render(
      createElement(GameShellHud, {
        assetResult: runtime.assetResult,
        capacity: capacity(),
        copy: civilizationMessages(runtime.locale),
        locale: runtime.locale,
        onOpenSettings: actions.openSettings,
        production: production(),
        resourceDefs: RESOURCE_DEFS,
        resourceFormat,
        resources: runtime.state.resources,
        runtimeMode: runtime.mode,
        tokens: TOKEN_REGISTRY,
        worldApp: runtime.worldApp,
        worldBadge: runtime.worldBadge,
      }),
    );
  };
  const renderFooter = () => {
    const mount = runtime.root?.querySelector("[data-game-footer]");
    if (!mount) return;
    runtime.footerRoot ??= createRoot(mount);
    const copy = civilizationMessages(runtime.locale);
    runtime.footerRoot.render(
      createElement(GameFooter, {
        authority:
          runtime.mode === "world" ? copy.gameAuthority : copy.demoStorage,
        onReset: runtime.mode === "demo" ? actions.reset : undefined,
        resetLabel: copy.demoReset,
        runtimeMode: runtime.mode,
        status:
          runtime.mode === "demo"
            ? copy.demoFooter(runtime.state.raids)
            : copy.worldFooter(runtime.state.prestigeCount),
      }),
    );
  };
  const entryGuideRecommendation = () => {
    const selectedBuilding = runtime.selectedBuilding;
    const level = runtime.state.buildings[selectedBuilding];
    const requirements =
      runtime.mode === "world"
        ? runtime.adapter.getRequirements(runtime.state, selectedBuilding)
        : getRequirements(runtime.state, selectedBuilding);
    const cost =
      runtime.mode === "world"
        ? runtime.adapter.getBuildingCost(runtime.state, selectedBuilding)
        : getBuildingCost(runtime.state, selectedBuilding);
    const jobs =
      runtime.state.constructions ||
      (runtime.state.construction ? [runtime.state.construction] : []);
    return deriveEntryGuide({
      state: runtime.state,
      selectedBuilding,
      buildings: BUILDINGS,
      collection: {
        ...collection(),
        unclaimed:
          runtime.mode === "world"
            ? runtime.adapter.projectState(runtime.state, performance.now())
                .unclaimed
            : runtime.state.unclaimed,
      },
      jobs,
      remainingTime: remaining,
      level,
      maxLevel: MAX_BUILDING_LEVEL,
      requirements,
      affordable: Object.keys(RESOURCE_DEFS).every(
        (id) => runtime.state.resources[id] >= (cost[id] || 0),
      ),
      atCapacity:
        Number.isInteger(runtime.state.constructionOccupied) &&
        Number.isInteger(runtime.state.constructionCapacity) &&
        runtime.state.constructionOccupied >=
          runtime.state.constructionCapacity,
    });
  };
  const dismissEntryGuide = () => {
    runtime.entryGuideDismissed = true;
    renderEntryGuide();
  };
  const renderEntryGuide = () => {
    const mount = runtime.root?.querySelector("[data-entry-guide-mount]");
    if (!mount) return;
    runtime.entryGuideRoot ??= createRoot(mount);
    if (runtime.entryGuideDismissed) {
      runtime.entryGuideRoot.render(null);
      return;
    }
    runtime.entryGuideRoot.render(
      createElement(EntryGuide, {
        copy: civilizationMessages(runtime.locale),
        recommendation: entryGuideRecommendation(),
        onDismiss: dismissEntryGuide,
        onRoute: (recommendation) => {
          dismissEntryGuide();
          if (
            recommendation.target === "building" &&
            recommendation.buildingId
          ) {
            actions.selectBuilding(recommendation.buildingId);
            requestAnimationFrame(() =>
              runtime.root
                ?.querySelector(
                  `[data-map-building="${recommendation.buildingId}"]`,
                )
                ?.focus(),
            );
          } else if (recommendation.target === "collection") {
            requestAnimationFrame(() =>
              runtime.root?.querySelector("#gather")?.focus(),
            );
          } else if (recommendation.target === "completion") {
            actions.selectPanel("build");
            requestAnimationFrame(() =>
              runtime.root
                ?.querySelector('[data-next-action-button="complete"]')
                ?.focus(),
            );
          } else if (recommendation.target === "build-panel") {
            actions.selectPanel("build");
            requestAnimationFrame(() => {
              if (isMobileNavigationVisible()) {
                focusCommandPanel();
                return;
              }
              runtime.root
                ?.querySelector(
                  '[data-game-command-navigation="desktop"] [data-command-panel="build"]',
                )
                ?.focus();
            });
          }
        },
      }),
    );
  };
  const renderVillageMap = (focusTarget) => {
    const mount = runtime.root?.querySelector("[data-game-village-map]");
    if (!mount) return;
    const displayState =
      runtime.mode === "world"
        ? runtime.adapter.projectState(runtime.state, performance.now())
        : runtime.state;
    runtime.villageMapRoot ??= createRoot(mount);
    runtime.villageMapRoot.render(
      createElement(VillageMap, {
        assetResult: runtime.assetResult,
        assetsLoading: runtime.assetState === "loading",
        buildings: BUILDINGS,
        buildingLevels: runtime.state.buildings,
        capacity: capacity(),
        collectionStatus: {
          assetResult: runtime.assetResult,
          busy: runtime.busy,
          collection: collection(),
          copy: civilizationMessages(runtime.locale),
          locale: runtime.locale,
          onGather: actions.gather,
          resourceDefs: RESOURCE_DEFS,
          resourceFormat,
          unclaimed: displayState.unclaimed,
        },
        copy: civilizationMessages(runtime.locale),
        feedback: runtime.feedback,
        format,
        onSelectBuilding: actions.selectBuilding,
        onSelectMarket: () => actions.selectPanel("market"),
        prestigeCount: runtime.state.prestigeCount,
        runtimeMode: runtime.mode,
        selectedBuilding: runtime.selectedBuilding,
        activePanel: runtime.activePanel,
      }),
    );
    if (focusTarget) {
      requestAnimationFrame(() =>
        runtime.root?.querySelector(focusTarget)?.focus(),
      );
    }
  };
  const renderSettingsDialog = () => {
    const settingsDialog = runtime.root?.querySelector(
      "[data-game-settings-dialog]",
    );
    if (!settingsDialog) return;
    runtime.settingsDialogRoot ??= createRoot(settingsDialog);
    if (!runtime.settingsOpen) {
      runtime.settingsDialogRoot.render(null);
      return;
    }
    runtime.settingsDialogRoot.render(
      createElement(SettingsDialog, {
        copy: civilizationMessages(runtime.locale),
        locale: runtime.locale,
        onChangeLocale: actions.changeLocale,
        onClose: actions.closeSettings,
        onLogout: actions.logout,
        onSetReducedMotion: actions.setReducedMotion,
        reducedMotion: runtime.reducedMotion,
        walletAddress: runtime.walletAddress,
      }),
    );
  };
  const renderWalletReviewDialog = () => {
    const walletReviewDialog = runtime.root?.querySelector(
      "[data-wallet-review-dialog]",
    );
    if (!walletReviewDialog) return;
    runtime.walletReviewDialogRoot ??= createRoot(walletReviewDialog);
    const review = runtime.review.state();
    if (
      !["reviewing", "invalidated", "confirming", "pending"].includes(
        review.status,
      )
    ) {
      runtime.walletReviewDialogRoot.render(null);
      return;
    }
    runtime.walletReviewDialogRoot.render(
      createElement(WalletReviewDialog, {
        copy: civilizationMessages(runtime.locale),
        onCancel: cancelWalletReview,
        onConfirm: actions.confirmReview,
        review,
      }),
    );
  };
  const cancelWalletReview = () => {
    actions.cancelReview();
    // The imperative root is recreated when a review closes. Restore focus to
    // the current panel's equivalent navigation control after that replacement.
    requestAnimationFrame(() =>
      runtime.root
        ?.querySelector(
          `[data-game-command-navigation="desktop"] [data-command-panel="${runtime.activePanel}"]`,
        )
        ?.focus(),
    );
  };
  const panelContext = () => {
    const context = {
      state: runtime.state,
      collection: {
        ...collection(),
        unclaimed:
          runtime.mode === "world"
            ? runtime.adapter.projectState(runtime.state, performance.now())
                .unclaimed
            : runtime.state.unclaimed,
      },
      runtimeMode: runtime.mode,
      busy: runtime.busy,
      review: runtime.review.state(),
      locale: runtime.locale,
      copy: civilizationMessages(runtime.locale),
      assetResult: runtime.assetResult,
      selectedBuilding: runtime.selectedBuilding,
      selectedOpponent: runtime.selectedOpponent,
      buildings: Object.fromEntries(
        Object.entries(BUILDINGS).map(([id, building]) => [
          id,
          {
            ...building,
            label: civilizationMessages(runtime.locale).buildingNames[id],
            detail: civilizationMessages(runtime.locale).buildingDetails[id],
          },
        ]),
      ),
      troops: Object.fromEntries(
        Object.entries(TROOPS).map(([id, troop]) => [
          id,
          {
            ...troop,
            label: civilizationMessages(runtime.locale).troopNames[id],
          },
        ]),
      ),
      resourceDefs: Object.fromEntries(
        Object.entries(RESOURCE_DEFS).map(([id, resource]) => [
          id,
          {
            ...resource,
            label: civilizationMessages(runtime.locale).resourceNames[id],
            short: civilizationMessages(runtime.locale).resourceNames[
              id
            ].toUpperCase(),
          },
        ]),
      ),
      tokens: Object.fromEntries(
        Object.entries(TOKEN_REGISTRY).map(([id, token]) => [
          id,
          {
            ...token,
            name:
              id === "gold"
                ? token.name
                : civilizationMessages(runtime.locale).resourceNames[id],
          },
        ]),
      ),
      marketQuote: runtime.marketQuote,
      format: resourceFormat,
      remainingTime: remaining,
      buildDuration: (id, level) => runtime.durations.get(`${id}:${level}`),
      buildingPlan:
        runtime.mode === "world"
          ? () =>
              planBuildingDependencies({
                state: runtime.state,
                target: {
                  id: runtime.selectedBuilding,
                  level: runtime.state.buildings[runtime.selectedBuilding] + 1,
                },
                requirementsForLevel: runtime.adapter.getRequirementsForLevel,
                buildingCost: runtime.adapter.getBuildingCost,
                buildDuration: (id, level) =>
                  runtime.durations.get(`${id}:${level}`),
                constructionCapacity: runtime.adapter.getConstructionCapacity,
              })
          : null,
      requestPlanDurations: (plan) => {
        if (runtime.mode !== "world") return;
        plan.durationKeys?.forEach((key) => {
          const [id, level] = key.split(":");
          world.requestBuildDuration(id, Number(level), MAX_BUILDING_LEVEL);
        });
      },
      requirements: (id) =>
        runtime.mode === "world"
          ? runtime.adapter.getRequirements(runtime.state, id)
          : getRequirements(runtime.state, id),
      buildingCost: (id) =>
        runtime.mode === "world"
          ? runtime.adapter.getBuildingCost(runtime.state, id)
          : getBuildingCost(runtime.state, id),
      nextBuildingProduction: (id) => {
        const level = runtime.state.buildings[id];
        if (runtime.mode === "world") {
          const nextState = {
            ...runtime.state,
            buildings: { ...runtime.state.buildings, [id]: level + 1 },
          };
          return runtime.adapter.getProduction(nextState);
        }
        const nextRates = Object.entries(BUILDINGS[id].produces || {}).map(
          ([resource, rate]) => [resource, rate * (level + 1)],
        );
        return Object.fromEntries(nextRates);
      },
      upgradeImpact: (id) =>
        runtime.mode === "world"
          ? runtime.adapter.projectUpgradeImpact(runtime.state, id)
          : null,
      troopRequirements: (id) =>
        runtime.mode === "world"
          ? runtime.adapter.getTroopRequirements(runtime.state, id)
          : TROOPS[id].requires.filter(
              ({ id: required, level }) =>
                runtime.state.buildings[required] < level,
            ),
    };
    return context;
  };
  const panel = () => {
    const context = panelContext();
    if (runtime.activePanel === "build") {
      return buildPanel();
    }
    if (runtime.activePanel === "army") {
      return armyPanel(context);
    }
    if (runtime.activePanel === "market") {
      return marketPanel(context);
    }
    return raidPanel(context);
  };
  const renderBuildPanel = () => {
    if (runtime.activePanel !== "build") return;
    const mount = runtime.root?.querySelector("[data-game-build-panel]");
    if (!mount) return;
    runtime.buildPanelRoot ??= createRoot(mount);
    const context = panelContext();
    runtime.buildPanelRoot.render(
      createElement(BuildPanel, {
        ...context,
        onUpgrade: actions.upgrade,
        onCompleteUpgrade: actions.completeUpgrade,
        onBoost: actions.boost,
        onPrestige: actions.prestige,
        onOpenMarket: actions.openMarket,
        onGather: actions.gather,
      }),
    );
  };
  const renderArmyPanel = () => {
    if (runtime.activePanel !== "army") return;
    const mount = runtime.root?.querySelector("[data-game-army-panel]");
    if (!mount) return;
    runtime.armyPanelRoot ??= createRoot(mount);
    const context = panelContext();
    runtime.armyPanelRoot.render(
      createElement(ArmyPanel, {
        ...context,
        onTrain: actions.train,
        onOpenMarket: actions.openMarket,
      }),
    );
  };
  const renderMarketPanel = () => {
    if (runtime.activePanel !== "market") return;
    const mount = runtime.root?.querySelector("[data-game-market-panel]");
    if (!mount) return;
    runtime.marketPanelRoot ??= createRoot(mount);
    const context = panelContext();
    runtime.marketPanelRoot.render(
      createElement(MarketPanel, {
        ...context,
        marketDraft: runtime.marketDraft,
        marketOrigin: runtime.marketOrigin,
        onDraftChange: actions.marketInputsChanged,
        onQuote: actions.quoteMarket,
        onOrder: actions.marketOrder,
        onSwap: actions.swap,
      }),
    );
  };
  const renderRaidPanel = () => {
    if (runtime.activePanel !== "raid") return;
    const mount = runtime.root?.querySelector("[data-game-raid-panel]");
    if (!mount) return;
    runtime.raidPanelRoot ??= createRoot(mount);
    const context = panelContext();
    runtime.raidPanelRoot.render(
      createElement(RaidPanel, {
        ...context,
        raidDraft: runtime.raidDraft,
        onDraftChange: actions.raidInputsChanged,
        onPickOpponent: actions.pickOpponent,
        onSendRaid: actions.sendRaid,
        onResolveRaid: actions.resolveRaid,
      }),
    );
  };
  const render = () => {
    if (!isCurrent(runtime.token)) {
      return;
    }
    const gate = deriveGateState({
      access: hasAccess(runtime),
      mode: runtime.mode,
      ready: runtime.ready,
      state: runtime.state,
      loading: runtime.loading,
      feedback: runtime.feedback,
      copy: civilizationMessages(runtime.locale),
    });
    if (gate) {
      runtime.root.replaceChildren();
      runtime.onGateStateChange?.(gate, runtime.retryGate);
      return;
    }
    runtime.onGateStateChange?.(null, null);
    if (runtime.mode === "demo") {
      settle(runtime.state);
    }
    runtime.hudRoot?.unmount();
    runtime.hudRoot = null;
    runtime.footerRoot?.unmount();
    runtime.footerRoot = null;
    runtime.desktopNavigationRoot?.unmount();
    runtime.desktopNavigationRoot = null;
    runtime.mobileNavigationRoot?.unmount();
    runtime.mobileNavigationRoot = null;
    const activeMapControl = document.activeElement;
    let mapFocusTarget = null;
    if (
      activeMapControl instanceof HTMLElement &&
      runtime.root.contains(activeMapControl)
    ) {
      if (activeMapControl.dataset.mapBuilding) {
        mapFocusTarget = `[data-map-building="${activeMapControl.dataset.mapBuilding}"]`;
      } else if (activeMapControl.dataset.mapPanel) {
        mapFocusTarget = `[data-map-panel="${activeMapControl.dataset.mapPanel}"]`;
      }
    }
    runtime.villageMapRoot?.unmount();
    runtime.villageMapRoot = null;
    runtime.buildPanelRoot?.unmount();
    runtime.buildPanelRoot = null;
    runtime.armyPanelRoot?.unmount();
    runtime.armyPanelRoot = null;
    runtime.marketPanelRoot?.unmount();
    runtime.marketPanelRoot = null;
    runtime.raidPanelRoot?.unmount();
    runtime.raidPanelRoot = null;
    runtime.settingsDialogRoot?.unmount();
    runtime.settingsDialogRoot = null;
    runtime.entryGuideRoot?.unmount();
    runtime.entryGuideRoot = null;
    runtime.walletReviewDialogRoot?.unmount();
    runtime.walletReviewDialogRoot = null;
    runtime.root.innerHTML = gameShell({
      state: runtime.state,
      runtimeMode: runtime.mode,
      worldApp: runtime.worldApp,
      worldBadge: runtime.worldBadge,
      feedback: runtime.feedback,
      activePanel: runtime.activePanel,
      selectedBuilding: runtime.selectedBuilding,
      panel: panel(),
      production: production(),
      capacity: capacity(),
      resourceDefs: RESOURCE_DEFS,
      tokens: TOKEN_REGISTRY,
      format,
      resourceFormat,
      buildings: BUILDINGS,
      busy: runtime.busy,
      review: runtime.review.state(),
      locale: runtime.locale,
      copy: civilizationMessages(runtime.locale),
      locale: runtime.locale,
      assetResult: runtime.assetResult,
      assetsLoading: runtime.assetState === "loading",
      reducedMotion: runtime.reducedMotion,
    });
    renderHud();
    renderFooter();
    renderEntryGuide();
    bindGameActions(runtime.root, actions);
    // All dynamic map content, including collection and map actions, belongs
    // to this single React root. Bindings intentionally run before it mounts.
    renderVillageMap(mapFocusTarget);
    renderNavigation();
    // Keep the BuildPanel outside the imperative binding pass: its controls
    // are owned exclusively by React.
    renderBuildPanel();
    // Army training controls are likewise exclusively React-owned.
    renderArmyPanel();
    // Market form controls are controlled by React and excluded from bindings.
    renderMarketPanel();
    // Raid inputs and march status are exclusively React-owned.
    renderRaidPanel();
    // Settings is exclusively owned by React; imperative bindings do not
    // attach listeners inside this mount point.
    renderSettingsDialog();
    // The wallet review keeps its frozen runtime intent and actions in a
    // typed React modal; imperative bindings do not enter this mount point.
    renderWalletReviewDialog();
    world.requestBuildDuration(
      runtime.selectedBuilding,
      runtime.state.buildings[runtime.selectedBuilding] + 1,
      MAX_BUILDING_LEVEL,
    );
  };
  world = createWorldRuntime({
    runtime,
    isCurrent,
    render,
    errorText: (error) => errorText(error, runtime.locale),
    copy: () => civilizationMessages(runtime.locale),
    hasAccess: () => hasAccess(runtime),
  });
  runtime.retryGate = createGateRetryHandle(world.refresh);
  const actions = createGameActions(runtime, {
    render,
    requireAccess,
    requestWorldAction: world.requestAction,
    confirmWorldReview: world.confirmReview,
    cancelWorldReview: world.cancelReview,
    errorText: (error) => errorText(error, runtime.locale),
    copy: () => civilizationMessages(runtime.locale),
    isCurrent,
    buildings: BUILDINGS,
    buildingLabel: (id) =>
      civilizationMessages(runtime.locale).buildingNames[id],
    resourceDefs: () =>
      Object.fromEntries(
        Object.entries(RESOURCE_DEFS).map(([id, resource]) => [
          id,
          {
            ...resource,
            short: civilizationMessages(runtime.locale).resourceNames[
              id
            ].toUpperCase(),
          },
        ]),
      ),
    numberFormat: resourceFormat,
    changeLocale: (locale) => {
      if (locale !== "de-DE" && locale !== "en-US") return;
      runtime.locale = locale;
      const copy = civilizationMessages(locale);
      runtime.worldBadge = runtime.worldApp.installed
        ? `${copy.worldAppBadge}${runtime.walletAddress ? ` · ${runtime.walletAddress.slice(0, 6)}…${runtime.walletAddress.slice(-4)}` : ` · ${copy.worldAppConnected}`}`
        : copy.demoLocal;
      runtime.onLocaleChange?.(locale);
      render();
    },
    openSettings: () => {
      runtime.settingsOpen = true;
      render();
    },
    closeSettings: () => {
      runtime.settingsOpen = false;
      render();
      requestAnimationFrame(() =>
        runtime.root.querySelector("[data-open-settings]")?.focus(),
      );
    },
    setReducedMotion: (enabled) => {
      runtime.reducedMotion = enabled;
      window.localStorage.setItem(
        "civilization-reduced-motion",
        String(enabled),
      );
      render();
    },
    logout: () => runtime.onLogout?.(),
  });

  const refreshTickValues = () => {
    if (!runtime.state || !isCurrent(runtime.token)) {
      return;
    }
    renderHud();
    renderFooter();
    renderVillageMap();
    renderBuildPanel();
    renderArmyPanel();
    renderMarketPanel();
    renderRaidPanel();
    renderEntryGuide();
  };
  return { render, refreshWorld: world.refresh, refreshTickValues, actions };
}

/**
 * @param {{ root: HTMLElement | null, runtimeMode?: "demo" | "world", worldAppInstalled?: boolean,
 *   worldAccessConfirmed?: boolean, worldWalletAddress?: string | null, worldAdapter?: object | null,
 *   initialFeedback?: string, locale?: "de-DE" | "en-US", onLocaleChange?: (locale: "de-DE" | "en-US") => void,
 *   onLogout?: () => Promise<void>,
 *   onGateStateChange?: (gate: ({ kind: "access", detail: string, title: string } | { kind: "runtime", feedback: string, loading: boolean, retryLabel: string, title: string }) | null, retry: (() => void) | null) => void }} options
 */
export function startCivilizationApp(options) {
  if (!options.root || activeRuntime) {
    return;
  }
  const runtime = createRuntime({
    ...options,
    runtimeMode: options.runtimeMode || "world",
  });
  activeRuntime = runtime;
  const controller = createController(runtime);
  controller.render();
  loadCriticalAssets().then((assetResult) => {
    if (!isRuntimeCurrent(runtime)) return;
    runtime.assetState = "ready";
    runtime.assetResult = assetResult;
    controller.render();
  });
  if (runtime.mode === "world" && hasAccess(runtime)) {
    controller.refreshWorld();
  }
  runtime.visibilityHandler = () => {
    if (document.visibilityState === "visible" && isRuntimeCurrent(runtime)) {
      controller.refreshWorld({ quiet: true });
    }
  };
  document.addEventListener("visibilitychange", runtime.visibilityHandler);
  runtime.timer = setInterval(() => {
    if (!isRuntimeCurrent(runtime) || !hasAccess(runtime)) {
      return;
    }
    if (runtime.mode === "world") {
      if (!runtime.ready || !runtime.state) {
        return;
      }
      controller.refreshTickValues();
      runtime.refreshTicks += 1;
      if (runtime.refreshTicks >= 30) {
        runtime.refreshTicks = 0;
        controller.refreshWorld({ quiet: true });
      }
      return;
    }
    settle(runtime.state);
    if (
      runtime.state.pendingRaid &&
      Date.now() >= runtime.state.pendingRaid.arrivesAt
    ) {
      controller.actions.resolveDemoRaid();
      return;
    }
    saveDemoState(runtime.state);
    controller.refreshTickValues();
  }, 1_000);
}

export function stopCivilizationApp() {
  const runtime = activeRuntime;
  if (!runtime) {
    return;
  }
  activeRuntime = null;
  runtime.root = null;
  runtime.worldStateEpoch += 1;
  runtime.durations.clear();
  if (runtime.timer) {
    clearInterval(runtime.timer);
  }
  if (runtime.visibilityHandler) {
    document.removeEventListener("visibilitychange", runtime.visibilityHandler);
  }
  runtime.timer = null;
  runtime.visibilityHandler = null;
  runtime.adapter = null;
  // The parent React tree is removing the imperative root at this point.
  // Calling unmount on its nested HUD root during that render races React.
  runtime.hudRoot = null;
  runtime.footerRoot = null;
  runtime.desktopNavigationRoot = null;
  runtime.mobileNavigationRoot = null;
  runtime.villageMapRoot = null;
  runtime.settingsDialogRoot = null;
  runtime.entryGuideRoot = null;
  runtime.walletReviewDialogRoot = null;
  // Nested React roots can still flush work that was queued by the final
  // render while their parent is being removed. Keep this inert snapshot
  // available until those roots are collected; `activeRuntime = null` above
  // prevents it from being rendered or mutated by the application.
}
