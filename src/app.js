import "./styles.css";
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
import { loadCriticalAssets } from "./game-ui/assets.js";
import { clock, remainingTime } from "./game-ui/helpers.js";
import { buildPanel } from "./game-ui/views/build.js";
import { armyPanel } from "./game-ui/views/army.js";
import { marketPanel } from "./game-ui/views/market.js";
import { raidPanel } from "./game-ui/views/raid.js";
import {
  accessGateView,
  gameShell,
  runtimeGateView,
} from "./game-ui/views/shell.js";
import { bindGameActions } from "./game-ui/bindings.js";
import { createGameActions } from "./game-actions.js";
import { createWorldRuntime } from "./game-world-runtime.js";
import { createWalletReview } from "./world-game/review.js";
import { refreshGameTick } from "./game-tick.js";
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
    selectedOpponent: null,
    selectedBuilding: "townhall",
    activePanel: "build",
    locale: options.locale || "de-DE",
    onLocaleChange: options.onLocaleChange,
    onLogout: options.onLogout,
    settingsOpen: false,
    reducedMotion:
      typeof window !== "undefined" &&
      window.localStorage.getItem("civilization-reduced-motion") === "true",
    feedback:
      options.runtimeMode === "world"
        ? civilizationMessages(options.locale).loadingState
        : civilizationMessages(options.locale).chooseBuilding,
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
  const panel = () => {
    const context = {
      state: runtime.state,
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
      troopRequirements: (id) =>
        runtime.mode === "world"
          ? runtime.adapter.getTroopRequirements(runtime.state, id)
          : TROOPS[id].requires.filter(
              ({ id: required, level }) =>
                runtime.state.buildings[required] < level,
            ),
    };
    if (runtime.activePanel === "build") {
      return buildPanel(context);
    }
    if (runtime.activePanel === "army") {
      return armyPanel(context);
    }
    if (runtime.activePanel === "market") {
      return marketPanel(context);
    }
    return raidPanel(context);
  };
  const render = () => {
    if (!isCurrent(runtime.token)) {
      return;
    }
    if (!hasAccess(runtime)) {
      runtime.root.innerHTML = accessGateView(
        civilizationMessages(runtime.locale),
      );
      return;
    }
    if (runtime.mode === "world" && (!runtime.ready || !runtime.state)) {
      runtime.root.innerHTML = runtimeGateView({
        loading: runtime.loading,
        feedback: runtime.feedback,
        copy: civilizationMessages(runtime.locale),
      });
      bindGameActions(runtime.root, {
        retry: () => world.refresh(),
        troopIds: Object.keys(TROOPS),
      });
      return;
    }
    if (runtime.mode === "demo") {
      settle(runtime.state);
    }
    const displayState =
      runtime.mode === "world"
        ? runtime.adapter.projectState(runtime.state, performance.now())
        : runtime.state;
    const readyToClaim = Object.values(displayState.unclaimed).reduce(
      (total, value) => total + value,
      0,
    );
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
      displayState,
      collection: collection(),
      readyToClaim,
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
      walletAddress: runtime.walletAddress,
      settingsOpen: runtime.settingsOpen,
      reducedMotion: runtime.reducedMotion,
    });
    bindGameActions(runtime.root, actions);
    if (!runtime.state.construction?.pending) {
      world.requestBuildDuration(
        runtime.selectedBuilding,
        runtime.state.buildings[runtime.selectedBuilding] + 1,
        MAX_BUILDING_LEVEL,
      );
    }
  };
  world = createWorldRuntime({
    runtime,
    isCurrent,
    render,
    errorText: (error) => errorText(error, runtime.locale),
    copy: () => civilizationMessages(runtime.locale),
    hasAccess: () => hasAccess(runtime),
  });
  const actions = createGameActions(runtime, {
    render,
    requireAccess,
    requestWorldAction: world.requestAction,
    confirmWorldReview: world.confirmReview,
    cancelWorldReview: world.cancelReview,
    refreshWorld: world.refresh,
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
    const displayState =
      runtime.mode === "world"
        ? runtime.adapter.projectState(runtime.state, performance.now())
        : runtime.state;
    refreshGameTick({
      root: runtime.root,
      state: runtime.state,
      busy: runtime.busy,
      mode: runtime.mode,
      production: production(),
      displayState,
      collection: collection(),
      resourceFormat,
      remainingTime: remaining,
      copy: civilizationMessages(runtime.locale),
      locale: runtime.locale,
    });
  };
  return { render, refreshWorld: world.refresh, refreshTickValues, actions };
}

/**
 * @param {{ root: HTMLElement | null, runtimeMode?: "demo" | "world", worldAppInstalled?: boolean,
 *   worldAccessConfirmed?: boolean, worldWalletAddress?: string | null, worldAdapter?: object | null,
 *   locale?: "de-DE" | "en-US", onLocaleChange?: (locale: "de-DE" | "en-US") => void,
 *   onLogout?: () => Promise<void> }} options
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
  runtime.state = null;
}
