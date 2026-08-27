import test from "node:test";
import assert from "node:assert/strict";
import {
  clock,
  compactResourceValue,
  escapeHtml,
  productionRateText,
  remainingTime,
} from "../src/game-ui/helpers.js";
import {
  clearDemoState,
  loadDemoState,
  saveDemoState,
} from "../src/demo/storage.js";
import { BUILDING_IDS, STORAGE_KEY } from "../src/game-ui/constants.js";
import {
  CRITICAL_START_ASSETS,
  loadCriticalAssets,
  resetCriticalAssetCacheForTest,
} from "../src/game-ui/assets.js";
import { MAP_BUILDING_ANCHORS } from "../src/game-ui/map-coordinates.js";
import { createWorldRuntime } from "../src/game-world-runtime.js";
import { createGameActions } from "../src/game-actions.js";
import { createInitialState } from "../src/game.js";
import { civilizationMessages } from "../src/lib/civilization-locale.ts";
import { access, readFile } from "node:fs/promises";

test("critical assets preload maps, buildings, and resources without blocking controls", async () => {
  resetCriticalAssetCacheForTest();
  const images = [];
  const createImage = () => {
    const image = { complete: false, naturalWidth: 0 };
    images.push(image);
    return image;
  };
  let settled = false;
  const preload = loadCriticalAssets({ createImage });
  const first = preload.then((result) => {
    settled = true;
    return result;
  });
  assert.equal(images.length, CRITICAL_START_ASSETS.length);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    settled,
    false,
    "slow assets continue loading in the background",
  );
  images.forEach((image, index) => {
    if (index === 0) image.onerror();
    else image.onload();
  });
  const result = await first;
  assert.deepEqual(result.failed, [CRITICAL_START_ASSETS[0]]);
  assert.ok(
    CRITICAL_START_ASSETS.some((src) => src.includes("/resources/wood.png")),
    "resource sprites are part of the critical preload",
  );

  const reused = loadCriticalAssets({
    createImage: () =>
      assert.fail("cached preload must not create another image"),
  });
  assert.strictEqual(
    reused,
    preload,
    "remounts reuse the same preload promise",
  );
  await reused;
  resetCriticalAssetCacheForTest();
});

test("pure UI helpers format time, escape markup, and clamp elapsed time", () => {
  assert.equal(clock(65), "01:05");
  assert.equal(clock(3_661), "01:01:01");
  assert.equal(clock(90_061), "1T 01:01:01");
  assert.equal(escapeHtml(`<tag a="x">&`), "&lt;tag a=&quot;x&quot;&gt;&amp;");
  assert.equal(remainingTime(1_000, 1_001), 0);
});

test("GameFooter keeps reset demo-only and renders dynamic values as React children", async () => {
  const footer = await readFile(
    new URL("../src/components/GameFooter.tsx", import.meta.url),
    "utf8",
  );
  assert.match(footer, /<footer className="game-footer">/);
  assert.match(footer, /<i aria-hidden="true"\s*\/>/);
  assert.match(footer, /runtimeMode === "demo"/);
  assert.match(footer, /<button onClick=\{onReset\} type="button">/);
  assert.match(footer, /\{authority\}/);
  assert.match(footer, /\{status\}/);
  assert.doesNotMatch(footer, /dangerouslySetInnerHTML|innerHTML/);
});

test("GameShellFrame keeps the footer mount stable and reset exclusively in React", async () => {
  const [app, frame] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/GameShellFrame.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(frame, /<div data-game-footer>/);
  assert.match(frame, /<GameFooter \{\.\.\.props\.footer\} \/>/);
  assert.match(app, /runtime\.onFrameChange\(frame\(\)\)/);
  assert.doesNotMatch(
    app,
    /createRoot|shellRoot|replaceChildren|root\.innerHTML|gameShell\(/,
  );
});

test("GameShellFrame is the sole typed game shell and legacy renderers are absent", async () => {
  const [app, frame] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/GameShellFrame.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    app,
    /import \{ GameShellFrame \} from "\.\/components\/GameShellFrame"/,
  );
  assert.match(app, /createElement\(GameShellFrame/);
  assert.doesNotMatch(
    app,
    /game-ui\/(?:bindings|views\/(?:build|army|market|raid))/,
  );
  assert.doesNotMatch(frame, /innerHTML|dangerouslySetInnerHTML/);
  await Promise.all(
    [
      "../src/game-ui/bindings.js",
      "../src/game-ui/views/build.js",
      "../src/game-ui/views/army.js",
      "../src/game-ui/views/market.js",
      "../src/game-ui/views/raid.js",
    ].map((file) =>
      assert.rejects(access(new URL(file, import.meta.url)), {
        code: "ENOENT",
      }),
    ),
  );
});

test("resource HUD helpers abbreviate large values and preserve rate semantics", () => {
  assert.equal(compactResourceValue(999, String), "999");
  assert.equal(compactResourceValue(1_000, String), "1K");
  assert.equal(compactResourceValue(1_250, String), "1,3K");
  assert.equal(compactResourceValue(999_949, String), "999,9K");
  assert.equal(compactResourceValue(999_950, String), "1Mio");
  assert.equal(compactResourceValue(1_234_567, String), "1,2Mio");
  assert.equal(compactResourceValue(2_410_426_546, String), "2,4Mrd");
  assert.equal(compactResourceValue(1e18, String), "1Tr");
  assert.equal(compactResourceValue(1e21, String), "1E21");
  assert.equal(compactResourceValue(Number.MAX_VALUE, String), "1,8E308");
  assert.equal(compactResourceValue(Infinity, String), "0");

  const rate = (resourceId, value, mode = "demo") =>
    productionRateText({
      resourceId,
      rate: value,
      mode,
      formatValue: (amount) => compactResourceValue(amount, String),
    });
  assert.equal(rate("wood", 0, "world"), "+0/Tag");
  assert.equal(rate("wood", 35_100, "world"), "+35,1K/Tag");
  assert.equal(rate("gold", 0, "world"), "");
  assert.equal(rate("gold", 12, "world"), "+12/Tag");
  assert.equal(rate("wood", -1), "");
  assert.equal(rate("wood", Infinity), "");
});

test("demo storage migrates legacy loot fields without accepting incomplete snapshots", () => {
  const records = new Map();
  const storage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  };
  const legacyState = {
    resources: { wood: 7 },
    buildings: { townhall: 2 },
    troops: { spear: 1 },
    targets: [{ id: "old", loot: { wood: 3 } }],
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(legacyState));
  const migrated = loadDemoState(storage);
  assert.equal(migrated.targets[0].unclaimed.wood, 3);
  saveDemoState(migrated, storage);
  assert.ok(records.get(STORAGE_KEY));
  clearDemoState(storage);
  assert.equal(records.has(STORAGE_KEY), false);
});

test("GameShellFrame defines every stable shell landmark without HTML interpolation", async () => {
  const frame = await readFile(
    new URL("../src/components/GameShellFrame.tsx", import.meta.url),
    "utf8",
  );
  for (const landmark of [
    "data-game-shell-hud",
    "data-entry-guide-mount",
    "data-game-village-map",
    'data-game-command-navigation-mount="desktop"',
    'id="game-command-panel"',
    "data-game-build-panel",
    "data-game-army-panel",
    "data-game-market-panel",
    "data-game-raid-panel",
    "data-game-footer",
    'data-game-command-navigation-mount="mobile"',
    "data-game-settings-dialog",
    "data-wallet-review-dialog",
  ])
    assert.match(frame, new RegExp(landmark));
  assert.match(frame, /hidden=\{props\.activePanel !== "build"\}/);
  assert.doesNotMatch(frame, /innerHTML|dangerouslySetInnerHTML/);
});

test("GameShellFrame keeps panel mounts stable through switches and retains mobile focus behavior", async () => {
  const [app, frame, audit] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/GameShellFrame.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../scripts/capture-storybook-audit.mjs", import.meta.url),
      "utf8",
    ),
  ]);
  for (const panel of ["build", "army", "market", "raid"])
    assert.match(frame, new RegExp(`data-game-${panel}-panel hidden=`));
  assert.match(app, /const focusCommandPanel = \(\) =>/);
  assert.match(
    app,
    /selectedNavigation === "mobile"[\s\S]*?focusCommandPanel\(\)/,
  );
  assert.doesNotMatch(app, /root\.innerHTML/);
  assert.match(
    audit,
    /mobile-stable-game-shell-frame-195\.png[\s\S]*?width: 195, height: 422/,
  );
  assert.match(audit, /Stable GameShellFrame has horizontal overflow/);
});

test("village-map dynamic feedback is React-owned rather than shell interpolation", async () => {
  const map = await readFile(
    new URL("../src/components/VillageMap.tsx", import.meta.url),
    "utf8",
  );
  assert.match(map, /className="map-feedback" aria-live="polite"/);
  assert.match(map, /\{props\.feedback\}/);
  assert.doesNotMatch(map, /innerHTML|dangerouslySetInnerHTML/);
});

test("typed game navigation mounts both layouts, calls the runtime action, and preserves accessible active controls", async () => {
  const [app, component, css, frame] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/CommandNavigation.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/GameShellFrame.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(frame, /data-game-command-navigation-mount="desktop"/);
  assert.match(frame, /data-game-command-navigation-mount="mobile"/);
  assert.match(
    frame,
    /<CommandNavigation \{\.\.\.props\.desktopNavigation\} \/>/,
  );
  assert.match(
    app,
    /const selectPanelFromNavigation = \(panel, selectedNavigation\) =>/,
  );
  assert.match(app, /actions\.selectPanel\(panel\)/);
  assert.match(app, /data-game-command-navigation="\$\{selectedNavigation\}"/);
  assert.match(component, /export type CommandNavigationProps/);
  assert.match(
    component,
    /aria-label=\{mobile \? copy\.quickAccess : copy\.villageActions\}/,
  );
  assert.match(component, /aria-current=\{selected \? "page" : undefined\}/);
  assert.match(component, /aria-controls="game-command-panel"/);
  assert.match(component, /data-command-panel=\{panel\}/);
  assert.match(component, /copy\.buildShort/);
  assert.match(component, /copy\.armyShort/);
  assert.doesNotMatch(component, /role="tab"/);
  assert.match(app, /onSelectMarket: \(\) => actions\.selectPanel\("market"\)/);
  assert.match(app, /villageMap:/);
  assert.match(css, /\.game-shell button\s*\{\s*min-height:\s*2\.75rem/);
  assert.match(
    css,
    /\.game-shell button:focus-visible,[\s\S]*?outline:\s*3px solid #fff4bb[\s\S]*?box-shadow:\s*0 0 0 6px #07100e/,
  );
  assert.match(app, /requestAnimationFrame\(\(\) =>/);
  assert.match(app, /\?\.focus\(\)/);
});

test("failed resource and building sprites retain visible accessible fallbacks", async () => {
  const map = await readFile(
    new URL("../src/components/VillageMap.tsx", import.meta.url),
    "utf8",
  );
  assert.match(map, /has-asset-error/);
  assert.match(map, /buildingAssetUnavailable/);
  assert.match(map, /asset-building-fallback" role="status"/);
  assert.match(map, /onError=/);
});

test("GameShellFrame provides stable locale-independent navigation mounts", async () => {
  const frame = await readFile(
    new URL("../src/components/GameShellFrame.tsx", import.meta.url),
    "utf8",
  );
  assert.match(frame, /data-game-command-navigation-mount="desktop"/);
  assert.match(frame, /data-game-command-navigation-mount="mobile"/);
  assert.match(frame, /data-game-shell-hud/);
  assert.match(frame, /data-game-village-map/);
});

test("English values retain English number formatting", () => {
  assert.equal(compactResourceValue(1_250, String, "en-US"), "1.3K");
});

test("map buildings use normalized bottom-centre anchors across renders and atlases", async () => {
  const ids = [...BUILDING_IDS, "market"];
  assert.deepEqual(Object.keys(MAP_BUILDING_ANCHORS), ids);
  for (const id of ids) {
    for (const viewport of ["desktop", "mobile"]) {
      const point = MAP_BUILDING_ANCHORS[id][viewport];
      assert.equal(point.length, 2, `${id} has an x/y ${viewport} point`);
      assert.ok(
        point.every((coordinate) => coordinate >= 0 && coordinate <= 100),
        `${id} ${viewport} point stays inside the map`,
      );
    }
  }

  const state = {
    resources: { wood: 0, clay: 0, stone: 0, gold: 0 },
    unclaimed: { wood: 0, clay: 0, stone: 0, gold: 0 },
    buildings: Object.fromEntries(BUILDING_IDS.map((id) => [id, 1])),
    raids: 0,
  };
  const context = {
    state,
    runtimeMode: "demo",
    worldApp: { installed: false },
    worldBadge: "DEMO · LOKAL",
    feedback: "bereit",
    activePanel: "build",
    selectedBuilding: "townhall",
    panel: "",
    production: { wood: 0, clay: 0, stone: 0, gold: 0 },
    capacity: 100,
    displayState: state,
    collection: { locked: false, detail: "FELD" },
    readyToClaim: 0,
    resourceDefs: {},
    tokens: {},
    format: String,
    resourceFormat: String,
    buildings: Object.fromEntries(
      BUILDING_IDS.map((id) => [id, { label: id }]),
    ),
    busy: false,
  };
  void context;
  const map = await readFile(
    new URL("../src/components/VillageMap.tsx", import.meta.url),
    "utf8",
  );
  assert.match(map, /MAP_BUILDING_ANCHORS/);
  assert.match(map, /data-map-anchor="bottom-center"/);
  assert.match(map, /--map-anchor-x-desktop/);
  assert.match(map, /--map-anchor-y-mobile/);

  const css = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.map-building\s*\{[\s\S]*?left: var\(--map-anchor-x-desktop\);[\s\S]*?top: var\(--map-anchor-y-desktop\);[\s\S]*?transform: translate\(-50%, -100%\)/,
  );
  assert.match(
    css,
    /@media \(max-width: 640px\)\s*\{[\s\S]*?\.map-building\s*\{[\s\S]*?left: var\(--map-anchor-x-mobile\);[\s\S]*?top: var\(--map-anchor-y-mobile\)/,
  );
  assert.doesNotMatch(css, /--ground-anchor/);
});

test("GameShellFrame provides stable React mounts for HUD and village map", async () => {
  const frame = await readFile(
    new URL("../src/components/GameShellFrame.tsx", import.meta.url),
    "utf8",
  );
  assert.match(frame, /<GameShellHud \{\.\.\.props\.hud\} \/>/);
  assert.match(frame, /<VillageMap \{\.\.\.props\.villageMap\} \/>/);
  assert.doesNotMatch(frame, /innerHTML|dangerouslySetInnerHTML/);
});

test("mobile HUD keeps all four resources in one bounded row at normal mobile widths", async () => {
  const css = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  const mobile = css.slice(css.indexOf("@media (max-width: 640px)"));
  assert.match(
    mobile,
    /\.resource-settings\s*\{[\s\S]*?order: 0[\s\S]*?margin-left: auto/,
  );
  assert.match(
    mobile,
    /\.resource-hud\s*\{[\s\S]*?order: 1[\s\S]*?flex-basis: 100%[\s\S]*?width: 100%/,
  );
  assert.match(
    css,
    /\.resource-settings\s*\{[\s\S]*?width: 2\.75rem[\s\S]*?min-height: 2\.75rem/,
  );
  assert.match(
    css,
    /\.resource-production\s*\{[\s\S]*?display: block[\s\S]*?max-width: 100%[\s\S]*?white-space: nowrap/,
  );
  assert.match(
    mobile,
    /\.resource \.resource-production-label\s*\{\s*display: none/,
  );
  assert.match(
    mobile,
    /\.resource-hud\s*\{[\s\S]*?width: 100%[\s\S]*?margin-left: 0[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)[\s\S]*?overflow: visible/,
  );
  assert.match(
    mobile,
    /\.resource-values\s*\{[\s\S]*?grid-column: 2[\s\S]*?width: 100%[\s\S]*?min-width: 0/,
  );
  assert.match(mobile, /\.resource-production\s*\{[\s\S]*?grid-column: 1\/-1/);
  assert.match(
    css,
    /\.collect-button\s*\{[\s\S]*?max-width: calc\(100% - 3\.2rem\)/,
  );
  assert.match(
    css,
    /\.collection-resources\s*\{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)[\s\S]*?min-width: 0/,
  );
  assert.match(
    css,
    /\.collection-resource b\s*\{[\s\S]*?overflow: hidden[\s\S]*?text-overflow: ellipsis[\s\S]*?white-space: nowrap/,
  );
  assert.match(
    mobile,
    /\.collect-button > \[data-collection-status\]\s*\{\s*display: none/,
  );
  assert.doesNotMatch(mobile, /\.collect-button span\s*\{\s*display: none/);
});

test("construction jobs span the full build inspector width", async () => {
  const css = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.build-inspector\s*>\s*\.construction-jobs\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1[\s\S]*?display:\s*grid[\s\S]*?gap:\s*0\.8rem/,
  );
});

test("mobile command actions reserve space above the fixed navigation", async () => {
  const [css, navigation, inspector, nextTaskCard, locale] = await Promise.all([
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/CommandNavigation.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/BuildPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/NextTaskCard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/lib/civilization-locale.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(
    css,
    /--mobile-nav-safe-space: calc\(5\.8rem \+ env\(safe-area-inset-bottom\)\)/,
  );
  assert.match(
    css,
    /\.game-shell\s*\{[\s\S]*?padding: 0\.6rem 0\.6rem var\(--mobile-nav-safe-space\)/,
  );
  assert.match(
    css,
    /\.build-inspector > \.build-primary-action\s*\{[\s\S]*?align-self: start[\s\S]*?position: sticky[\s\S]*?bottom: calc\(4\.35rem \+ env\(safe-area-inset-bottom\)\)/,
  );
  assert.match(navigation, /command-nav-icon/);
  assert.match(navigation, /aria-current=\{selected \? "page" : undefined\}/);
  assert.match(inspector, /<NextTaskCard/);
  assert.match(nextTaskCard, /export type NextTaskCardProps/);
  assert.match(
    nextTaskCard,
    /<details className="build-secondary next-task-details">/,
  );
  assert.match(nextTaskCard, /className="primary-action build-primary-action"/);
  assert.match(
    locale,
    /nextTaskDetails: "VIEW BUILD COSTS, REQUIREMENTS & IMPACT"/,
  );
});

test("build mobile hierarchy exposes one primary path and statuses for unavailable construction actions", async () => {
  const [inspector, css, stories, nextTaskCard] = await Promise.all([
    readFile(
      new URL("../src/components/BuildPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../src/components/CivilizationUiAudit.stories.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/components/NextTaskCard.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(inspector, /import \{ marketPrefill \}/);
  assert.doesNotMatch(inspector, /marketPrefills/);
  assert.match(
    inspector,
    /const prioritizedMarket = marketPrefill\(upgradeDeficits\)/,
  );
  assert.match(inspector, /kind: nextAction\.kind/);
  assert.match(nextTaskCard, /data-next-action-button=\{action\.kind\}/);
  assert.doesNotMatch(
    inspector,
    /nextAction\.kind === "collect"[\s\S]*?label: copy\.collect/,
  );
  assert.match(inspector, /data-construction-status/);
  assert.match(inspector, /boost\.eligible \? \(/);
  assert.match(inspector, /className="secondary-action"/);
  const boostControl = inspector.slice(
    inspector.indexOf("data-boost-construction"),
    inspector.indexOf("data-boost-construction") + 350,
  );
  assert.doesNotMatch(boostControl, /disabled=/);
  assert.match(inspector, /data-complete-upgrade/);
  assert.match(inspector, /disabled=\{props\.busy\}/);
  assert.match(
    css,
    /\.next-action > \.primary-action\s*\{[\s\S]*?bottom: calc\(4\.35rem \+ env\(safe-area-inset-bottom\)\)/,
  );
  assert.match(css, /\.secondary-action\s*\{[\s\S]*?min-height: 2\.75rem/);
  assert.match(stories, /export const ConstructionReady/);
  assert.match(stories, /export const ConstructionBoostUnavailable/);
});

test("mobile collection wayfinding keeps the one map control clear and localizes the handoff", async () => {
  const [css, collectionStatus, buildPanel, stories, auditCapture] =
    await Promise.all([
      readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
      readFile(
        new URL("../src/components/CollectionStatus.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/components/BuildPanel.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../src/components/CivilizationUiAudit.stories.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../scripts/capture-storybook-audit.mjs", import.meta.url),
        "utf8",
      ),
    ]);
  const villageMapMobileStart = css.indexOf(
    "@media (max-width: 640px) {\n  .village-map {",
  );
  const villageMapMobileEnd = css.indexOf(
    "@media (prefers-reduced-motion: reduce)",
    villageMapMobileStart,
  );
  assert.notEqual(villageMapMobileStart, -1);
  assert.notEqual(villageMapMobileEnd, -1);
  const mobileMapStyles = css.slice(villageMapMobileStart, villageMapMobileEnd);

  assert.match(
    mobileMapStyles,
    /\.collect-button\s*\{[\s\S]*?top:\s*auto[\s\S]*?bottom:\s*0;/,
  );
  assert.match(
    mobileMapStyles,
    /\.map-feedback\s*\{[\s\S]*?right:\s*auto[\s\S]*?left:\s*0\.7rem[\s\S]*?max-width:\s*34%/,
  );
  assert.match(
    css,
    /@media \(max-width: 359px\)\s*\{[\s\S]*?\.map-building\.map-timber\.is-selected span\s*\{[\s\S]*?transform:\s*translateY\(1\.5rem\) scale\(1\)/,
  );
  assert.match(css, /\.game-shell button\s*\{\s*min-height:\s*2\.75rem/);
  assert.match(
    css,
    /--mobile-nav-safe-space: calc\(5\.8rem \+ env\(safe-area-inset-bottom\)\)/,
  );
  assert.match(collectionStatus, /id="gather"/);
  assert.equal((collectionStatus.match(/id="gather"/g) || []).length, 1);
  assert.match(
    auditCapture,
    /Map collect control overlaps .* building hit target/,
  );
  assert.match(auditCapture, /Map collect control center is not hit-testable/);
  assert.doesNotMatch(buildPanel, /id="gather"/);
  const collectActionStart = buildPanel.indexOf(
    'nextAction.kind === "collect"',
  );
  const collectActionEnd = buildPanel.indexOf(
    ': nextAction.kind === "complete"',
    collectActionStart,
  );
  assert.notEqual(collectActionStart, -1);
  assert.notEqual(collectActionEnd, -1);
  const collectActionBranch = buildPanel.slice(
    collectActionStart,
    collectActionEnd,
  );
  assert.doesNotMatch(collectActionBranch, /<button/);
  assert.equal(
    civilizationMessages("de-DE").nextActionCollect,
    "Sammle die Feldressourcen auf der Dorfkarte.",
  );
  assert.equal(
    civilizationMessages("en-US").nextActionCollect,
    "Collect field resources on the village map.",
  );
  assert.match(stories, /export const MobileCollectionWayfinding/);
});

test("isolated mobile navigation story provides its aria-controls target", async () => {
  const stories = await readFile(
    new URL(
      "../src/components/CivilizationUiAudit.stories.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const fixture = stories.slice(
    stories.indexOf("export const BottomNavigation"),
  );
  assert.match(fixture, /id="game-command-panel"/);
  assert.match(fixture, /<CommandNavigation[\s\S]*?mobile/);
});

test("world market keeps its quote behavior while liquidity detail is a native closed disclosure", async () => {
  const [marketPanel, stories, css] = await Promise.all([
    readFile(
      new URL("../src/components/MarketPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/components/CivilizationUiAudit.stories.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  const worldStart = marketPanel.indexOf('if (props.runtimeMode === "world")');
  const demoStart = marketPanel.lastIndexOf("\n  return (");
  const worldMarket = marketPanel.slice(worldStart, demoStart);

  assert.match(
    worldMarket,
    /<details className="market-liquidity-disclosure">/,
  );
  assert.match(
    worldMarket,
    /<summary>[\s\S]*?copy\.liquiditySpread[\s\S]*?copy\.marketExplanation[\s\S]*?<\/summary>/,
  );
  assert.match(
    worldMarket,
    /<summary>[\s\S]*?<\/summary>[\s\S]*?<small>\{copy\.marketDetail\}<\/small>/,
  );
  assert.match(worldMarket, /className="market-origin" role="status"/);
  assert.match(worldMarket, /id="market-amount"/);
  assert.match(worldMarket, /id="market-quote"/);
  assert.match(worldMarket, /onClick=\{props\.onQuote\}/);
  assert.match(worldMarket, /onClick=\{\(\) => props\.onOrder\("buy"\)\}/);
  assert.match(worldMarket, /onClick=\{\(\) => props\.onOrder\("sell"\)\}/);
  assert.match(worldMarket, /props\.onDraftChange\(\{ resource \}\)/);
  assert.match(
    css,
    /\.market-liquidity-disclosure summary\s*\{[\s\S]*?min-height:\s*2\.75rem/,
  );
  assert.match(css, /\.market-liquidity-disclosure summary:focus-visible/);
  assert.match(stories, /export const WorldMarketMobile/);
});

test("app lifecycle keeps GameShellFrame typed and refreshes World exactly once per polling interval", async () => {
  const [app, armyPanel, collectionStatus, marketPanel, raidPanel, villageMap] =
    await Promise.all([
      readFile(new URL("../src/app.js", import.meta.url), "utf8"),
      readFile(
        new URL("../src/components/ArmyPanel.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/components/CollectionStatus.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/components/MarketPanel.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/components/RaidPanel.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../src/components/VillageMap.tsx", import.meta.url),
        "utf8",
      ),
    ]);
  assert.match(app, /export function startCivilizationApp/);
  assert.match(app, /export function stopCivilizationApp/);
  assert.match(app, /clearInterval\(runtime\.timer\)/);
  assert.match(app, /refreshTicks: 0/);
  const periodicRefresh = app.slice(
    app.indexOf("if (runtime.refreshTicks >= 30)"),
    app.indexOf("return;", app.indexOf("if (runtime.refreshTicks >= 30)")),
  );
  assert.match(periodicRefresh, /runtime\.refreshTicks = 0/);
  assert.equal(
    (
      periodicRefresh.match(/controller\.refreshWorld\(\{ quiet: true \}\)/g) ||
      []
    ).length,
    1,
  );
  assert.match(app, /game-ui/);
  assert.doesNotMatch(app, /isConnected/);
  assert.doesNotMatch(
    app,
    /bindGameActions|root\.innerHTML|game-ui\/bindings|game-ui\/views\//,
  );
  assert.match(app, /createElement\(GameShellFrame/);
  assert.match(app, /runtime\.onFrameChange\(frame\(\)\)/);
  assert.match(collectionStatus, /export type CollectionStatusProps/);
  assert.match(app, /onGather: actions\.gather/);
  assert.match(
    villageMap,
    /<CollectionStatus \{\.\.\.props\.collectionStatus\} \/>/,
  );
  assert.match(villageMap, /onClick=\{\(\) => props\.onSelectBuilding\(id\)\}/);
  assert.match(villageMap, /onClick=\{props\.onSelectMarket\}/);
  assert.match(collectionStatus, /disabled=\{disabled\}/);
  assert.match(collectionStatus, /data-ready-to-claim-accessible/);
  assert.match(collectionStatus, /data-collection-resource-accessible/);
  assert.doesNotMatch(app, /refreshGameTick/);
  assert.match(armyPanel, /data-asset-container/);
  assert.match(armyPanel, /onError=/);
  assert.match(armyPanel, /classList\.add\("has-asset-error"\)/);
  assert.match(armyPanel, /asset-building-fallback" role="status"/);
  assert.match(marketPanel, /onDraftChange/);
  assert.match(marketPanel, /quoteMatchesDraft/);
  assert.match(
    marketPanel,
    /const canOrder = Boolean\(quoteMatchesDraft\) && !props\.busy/,
  );
  assert.match(marketPanel, /id="market-buy"\s+disabled=\{!canOrder\}/);
  assert.match(marketPanel, /id="market-sell"\s+disabled=\{!canOrder\}/);
  assert.match(raidPanel, /onPickOpponent/);
  assert.match(raidPanel, /targetAddress/);
  assert.match(raidPanel, /data-raid-countdown/);
});

test("settings dialog is a typed React island with runtime-owned actions and keyboard lifecycle", async () => {
  const [app, frame, settings, hud] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/GameShellFrame.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/SettingsDialog.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/GameShellHud.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(frame, /data-game-settings-dialog/);
  assert.match(frame, /<SettingsDialog \{\.\.\.props\.settings\} \/>/);
  assert.match(app, /onChangeLocale: actions\.changeLocale/);
  assert.match(app, /onSetReducedMotion: actions\.setReducedMotion/);
  assert.match(app, /onLogout: actions\.logout/);
  assert.match(settings, /export type SettingsDialogProps/);
  assert.match(settings, /navigator\.clipboard\?\.writeText/);
  assert.match(settings, /event\.key === "Escape"/);
  assert.match(settings, /event\.key !== "Tab"/);
  assert.match(
    settings,
    /querySelector<HTMLElement>\("\[data-close-settings\]"\)/,
  );
  assert.match(settings, /\.focus\(\)/);
  assert.match(settings, /aria-modal="true"/);
  assert.match(settings, /aria-live="polite"/);
  assert.match(settings, /checked=\{props\.reducedMotion\}/);
  assert.match(settings, /logoutPending \? props\.copy\.logoutPending/);
  assert.match(
    settings,
    /className="settings-primary-action"[\s\S]*?onClick=\{\(\) => void props\.onApplyAppearance\(\)\}/,
  );
  assert.match(
    settings,
    /className="settings-appearance-reset"[\s\S]*?onClick=\{\(\) => void props\.onResetAppearance\(\)\}/,
  );
  assert.ok(
    settings.indexOf("settings-primary-action") <
      settings.indexOf("settings-appearance-reset"),
    "Apply remains before Reset in the appearance action order",
  );
  assert.match(hud, /data-open-settings/);
  assert.match(hud, /aria-label=\{props\.copy\.settings\}/);
  assert.match(hud, /title=\{props\.copy\.settings\}/);
  assert.match(hud, /<span aria-hidden="true">⚙<\/span>/);
});

test("wallet review dialog is a typed React island with frozen runtime actions and modal keyboard access", async () => {
  const [app, frame, dialog] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/GameShellFrame.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/WalletReviewDialog.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(frame, /data-wallet-review-dialog/);
  assert.match(frame, /<WalletReviewDialog \{\.\.\.props\.walletReview\} \/>/);
  assert.match(app, /onCancel: cancelWalletReview/);
  assert.match(app, /onConfirm: actions\.confirmReview/);
  assert.match(app, /requestAnimationFrame\(\(\) =>/);
  assert.match(app, /data-game-command-navigation="\$\{selectedNavigation\}"/);
  const cancelWalletReview = app.slice(
    app.indexOf("const cancelWalletReview = () =>"),
    app.indexOf("const panelContext = () =>"),
  );
  assert.match(
    cancelWalletReview,
    /data-game-command-navigation="desktop"\] \[data-command-panel="\$\{runtime\.activePanel\}"/,
  );
  assert.doesNotMatch(cancelWalletReview, /command-tabs|data-panel=/);
  assert.match(dialog, /export type WalletReviewDialogProps/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /data-confirm-wallet-review/);
  assert.match(dialog, /data-cancel-wallet-review/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /\.focus\(\)/);
  assert.match(dialog, /disabled=\{unavailable\}/);
});

test("changing a quoted market draft invalidates stone x50 and cannot confirm it as wood x1", () => {
  const reviews = [];
  const invalidations = [];
  const runtime = {
    mode: "world",
    token: Symbol("market"),
    marketDraft: { resource: "stone", from: "wood", to: "clay", amount: 50 },
    marketInputRevision: 0,
    marketQuote: {
      resource: "stone",
      amount: 50,
      buyGoldIn: 500n,
      buyFee: 3n,
      sellGoldOut: 494n,
      sellFee: 3n,
      inventory: 9n,
      reserve: 500n,
      deadline: 1234,
    },
    review: {
      invalidate: (reason) => invalidations.push(reason),
      state: () => ({ status: "idle" }),
    },
  };
  const actions = createGameActions(runtime, {
    render: () => {},
    requireAccess: () => true,
    requestWorldAction: (type, payload) => reviews.push({ type, payload }),
    confirmWorldReview: () => {},
    cancelWorldReview: () => {},
    errorText: String,
    isCurrent: () => true,
    copy: () => civilizationMessages("en-US"),
    buildingLabel: String,
    resourceDefs: () => ({}),
    numberFormat: String,
  });

  actions.marketInputsChanged({ resource: "wood", amount: 1 });
  assert.deepEqual(runtime.marketDraft, {
    resource: "wood",
    from: "wood",
    to: "clay",
    amount: 1,
  });
  assert.equal(runtime.marketQuote, null);
  assert.deepEqual(invalidations, ["market_inputs_changed"]);
  actions.marketOrder("buy");
  assert.deepEqual(reviews, []);
  assert.equal(runtime.feedback, "Load a current live quote first.");
});

test("a quote resolving after the market draft changes is discarded and cannot be confirmed", async () => {
  const reviews = [];
  let resolveQuote;
  const runtime = {
    mode: "world",
    token: Symbol("market"),
    marketDraft: { resource: "stone", from: "wood", to: "clay", amount: 50 },
    marketInputRevision: 0,
    marketQuote: null,
    review: {
      invalidate: () => {},
      state: () => ({ status: "idle" }),
    },
    adapter: {
      quoteMarket: () =>
        new Promise((resolve) => {
          resolveQuote = resolve;
        }),
    },
  };
  const actions = createGameActions(runtime, {
    render: () => {},
    requireAccess: () => true,
    requestWorldAction: (type, payload) => reviews.push({ type, payload }),
    confirmWorldReview: () => {},
    cancelWorldReview: () => {},
    errorText: String,
    isCurrent: () => true,
    copy: () => civilizationMessages("en-US"),
    buildingLabel: String,
    resourceDefs: () => ({}),
    numberFormat: String,
  });

  const quoteRequest = actions.quoteMarket();
  actions.marketInputsChanged({ resource: "wood", amount: 1 });
  resolveQuote({
    resource: "stone",
    amount: 50,
    buyGoldIn: 500n,
    buyFee: 3n,
    sellGoldOut: 494n,
    sellFee: 3n,
    inventory: 9n,
    reserve: 500n,
    deadline: 1234,
  });
  await quoteRequest;

  assert.equal(runtime.marketQuote, null);
  actions.marketOrder("buy");
  assert.deepEqual(reviews, []);
  assert.equal(runtime.feedback, "Load a current live quote first.");
});

test("market review summary and payload use the same frozen quote intent", () => {
  const reviews = [];
  const quote = {
    resource: "stone",
    amount: 50,
    buyGoldIn: 500n,
    buyFee: 3n,
    sellGoldOut: 494n,
    sellFee: 3n,
    inventory: 9n,
    reserve: 500n,
    deadline: 1234,
  };
  const runtime = {
    mode: "world",
    marketDraft: { resource: "stone", from: "wood", to: "clay", amount: 50 },
    marketQuote: quote,
  };
  const actions = createGameActions(runtime, {
    render: () => {},
    requireAccess: () => true,
    requestWorldAction: (type, payload, success, details) =>
      reviews.push({ type, payload, success, details }),
    confirmWorldReview: () => {},
    cancelWorldReview: () => {},
    errorText: String,
    isCurrent: () => true,
    copy: () => civilizationMessages("en-US"),
    buildingLabel: String,
    resourceDefs: () => ({}),
    numberFormat: String,
  });

  actions.marketOrder("sell");
  quote.resource = "wood";
  quote.amount = 1;
  quote.sellGoldOut = 1n;

  assert.equal(reviews.length, 1);
  assert.deepEqual(reviews[0].payload, {
    resource: "stone",
    amount: 50,
    limit: 494n,
    deadline: 1234,
  });
  assert.ok(Object.isFrozen(reviews[0].payload));
  assert.match(reviews[0].details[0], /^Sell 50 Stone$/);
  assert.equal(reviews[0].details[1], "Limit: 494 CGOLD");
});

test("game action feedback follows the active locale and formats dynamic values", () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { setItem: () => {} };
  const runtime = {
    mode: "demo",
    state: createInitialState(),
    selectedBuilding: "townhall",
    activePanel: "build",
  };
  let locale = "de-DE";
  const actions = createGameActions(runtime, {
    render: () => {},
    requireAccess: () => true,
    performWorldAction: () => {},
    errorText: String,
    isCurrent: () => true,
    copy: () => civilizationMessages(locale),
    buildingLabel: () => civilizationMessages(locale).buildingNames.townhall,
    resourceDefs: () => ({
      wood: {
        color: "wood",
        short: civilizationMessages(locale).resourceNames.wood.toUpperCase(),
      },
    }),
    numberFormat: (value) => new Intl.NumberFormat(locale).format(value),
  });
  try {
    actions.selectBuilding("townhall");
    assert.equal(runtime.feedback, "Rathaus ausgewählt.");
    runtime.state.buildings.warehouse = 3;
    runtime.state.unclaimed = { wood: 1234 };
    actions.gather();
    assert.match(runtime.feedback, /1\.205 HOLZ/);
    locale = "en-US";
    runtime.selectedBuilding = "townhall";
    actions.selectBuilding("townhall");
    assert.equal(runtime.feedback, "Town hall selected.");
    runtime.state = createInitialState();
    runtime.state.buildings.warehouse = 3;
    runtime.state.unclaimed = { wood: 1234 };
    runtime.state.gatherAvailableAt = 0;
    actions.gather();
    assert.match(runtime.feedback, /1,205 WOOD/);
    assert.equal(
      civilizationMessages("de-DE").feedback.demoClaim("1.234 Holz"),
      "Im Speicher gesichert: 1.234 Holz. Nächste Sammlung in 01:00.",
    );
    assert.equal(
      civilizationMessages("en-US").feedback.demoClaim("1,234 Wood"),
      "Secured in storage: 1,234 Wood. Next collection in 01:00.",
    );
  } finally {
    globalThis.localStorage = originalStorage;
  }
});

test("construction wallet intents retain the selected parallel slot while slot zero uses the legacy ABI", () => {
  const intents = [];
  const runtime = { mode: "world", state: {}, selectedBuilding: "timber" };
  const actions = createGameActions(runtime, {
    render: () => {},
    requireAccess: () => true,
    requestWorldAction: (type, payload) => intents.push({ type, payload }),
    confirmWorldReview: () => {},
    cancelWorldReview: () => {},
    errorText: String,
    isCurrent: () => true,
    copy: () => civilizationMessages("en-US"),
    buildingLabel: String,
    resourceDefs: () => ({}),
    numberFormat: String,
  });
  actions.completeUpgrade(0);
  actions.boost(0);
  actions.completeUpgrade(1);
  actions.boost(2);
  assert.deepEqual(intents, [
    { type: "complete_upgrade", payload: {} },
    { type: "boost", payload: { hours: 1 } },
    { type: "complete_upgrade", payload: { slot: 1 } },
    { type: "boost", payload: { hours: 1, slot: 2 } },
  ]);
});

test("World runtime feedback uses localized pending and completion messages", async () => {
  for (const [locale, pending, complete] of [
    [
      "de-DE",
      "Bestätige die World-Chain-Transaktion in deiner Wallet.",
      "Erledigt.",
    ],
    ["en-US", "Confirm the World Chain transaction in your wallet.", "Done."],
  ]) {
    const runtime = {
      token: Symbol(locale),
      mode: "world",
      ready: true,
      busy: false,
      adapter: { execute: async () => ({ state: {}, pending: false }) },
    };
    const feedback = [];
    const world = createWorldRuntime({
      runtime,
      isCurrent: () => true,
      render: () => feedback.push(runtime.feedback),
      errorText: String,
      hasAccess: () => true,
      copy: () => civilizationMessages(locale),
    });
    await world.performAction("claim", {}, complete);
    assert.equal(feedback[0], pending);
    assert.equal(runtime.feedback, complete);
  }
});

test("a stale World read cannot overwrite a post-receipt state", async () => {
  let resolveRead;
  const runtime = {
    token: Symbol("mount"),
    mode: "world",
    ready: true,
    adapter: {
      readState: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      execute: async () => ({ state: { version: "receipt" }, pending: false }),
    },
    busy: false,
    refreshing: false,
    loading: false,
    worldStateEpoch: 0,
    durations: new Map(),
  };
  const world = createWorldRuntime({
    runtime,
    isCurrent: () => true,
    render: () => {},
    errorText: String,
    hasAccess: () => true,
    copy: () => civilizationMessages("de-DE"),
  });
  const refresh = world.refresh();
  await world.performAction("claim", {}, "fertig");
  resolveRead({ version: "stale-read" });
  await refresh;
  assert.equal(runtime.state.version, "receipt");
  assert.equal(runtime.worldStateEpoch, 1);
});

test("a fresh World snapshot invalidates a reviewed upgrade before dispatch", async () => {
  const runtime = {
    token: Symbol("planner-state"),
    mode: "world",
    ready: true,
    busy: false,
    refreshing: false,
    loading: false,
    worldStateEpoch: 0,
    adapter: { readState: async () => ({ version: "changed" }) },
  };
  const world = createWorldRuntime({
    runtime,
    isCurrent: () => true,
    render: () => {},
    errorText: String,
    hasAccess: () => true,
    copy: () => civilizationMessages("en-US"),
  });
  world.requestAction("upgrade", { building: "timber" }, "started");
  await world.refresh({ quiet: true });
  assert.equal(runtime.review.state().status, "invalidated");
  assert.equal(runtime.review.state().reason, "world_state_changed");
});

test("old mount callbacks cannot update the replacement runtime", async () => {
  let resolveDuration;
  const runtime = {
    token: Symbol("old"),
    mode: "world",
    adapter: {
      readBuildDuration: () =>
        new Promise((resolve) => {
          resolveDuration = resolve;
        }),
    },
    durations: new Map(),
  };
  let current = true;
  const world = createWorldRuntime({
    runtime,
    isCurrent: () => current,
    render: () => assert.fail("stale callback rendered"),
    errorText: String,
    hasAccess: () => true,
    copy: () => civilizationMessages("de-DE"),
  });
  world.requestBuildDuration("townhall", 2, 30);
  current = false;
  resolveDuration(60);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.durations.get("townhall:2"), null);
});

test("entry guide primary routes dismiss the current session before every focus-only handoff", async () => {
  const [app, stories, audit] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../src/components/CivilizationUiAudit.stories.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../scripts/capture-storybook-audit.mjs", import.meta.url),
      "utf8",
    ),
  ]);
  const routeStart = app.indexOf("onRoute: (recommendation) => {");
  const routeEnd = app.indexOf("\n      },\n    };", routeStart);
  const route = app.slice(routeStart, routeEnd);

  assert.match(
    app,
    /const dismissEntryGuide = \(\) => \{[\s\S]*?entryGuideDismissed = true;[\s\S]*?render\(\);/,
  );
  assert.match(app, /onDismiss: dismissEntryGuide/);
  assert.match(
    route,
    /^onRoute: \(recommendation\) => \{\s*dismissEntryGuide\(\);/,
  );
  for (const target of ["building", "collection", "completion", "build-panel"])
    assert.match(route, new RegExp(`recommendation\\.target === "${target}"`));
  assert.match(route, /querySelector\((["'])\[data-complete-upgrade\]\1\)/);
  assert.doesNotMatch(
    route,
    /actions\.(?:gather|upgrade|completeUpgrade|boost|prestige|train|swap|marketOrder|sendRaid|resolveRaid)/,
  );
  assert.match(
    stories,
    /const \[entryGuideDismissed, setEntryGuideDismissed\] = useState\(false\);/,
  );
  assert.match(
    stories,
    /const routeToBuildAction = \(\) => \{\s*setEntryGuideDismissed\(true\);\s*focusBuildAction\(\);/,
  );
  assert.match(
    stories,
    /querySelector<HTMLButtonElement>\(\s*(["'])\[data-complete-upgrade\]\1,?\s*\)/,
  );
  assert.match(
    audit,
    /document\.querySelector\((["'])\[data-complete-upgrade\]\1\)/,
  );
  assert.match(stories, /\{entryGuideDismissed \? null : \(/);
});

test("mobile command navigation focuses and reveals the existing command panel", async () => {
  const [app, stories, audit] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../src/components/CivilizationUiAudit.stories.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../scripts/capture-storybook-audit.mjs", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    app,
    /const focusCommandPanel = \(\) => \{[\s\S]*?#game-command-panel[\s\S]*?tabIndex = -1;[\s\S]*?focus\(\{ preventScroll: true \}\);[\s\S]*?scrollIntoView\(\{[\s\S]*?block: "start"[\s\S]*?querySelector\("\.hud"\)[\s\S]*?getBoundingClientRect\(\)\.bottom[\s\S]*?window\.scrollBy/,
  );
  assert.match(
    app,
    /selectedNavigation === "mobile"[\s\S]*?focusCommandPanel\(\)/,
  );
  const routeStart = app.indexOf("onRoute: (recommendation) => {");
  const routeEnd = app.indexOf("\n        },\n      }),", routeStart);
  const route = app.slice(routeStart, routeEnd);
  assert.match(
    app,
    /const isMobileNavigationVisible = \(\) => \{[\s\S]*?data-game-command-navigation="mobile"[\s\S]*?getComputedStyle\(mobileNavigation\)\.display !== "none"/,
  );
  assert.match(
    route,
    /recommendation\.target === "build-panel"[\s\S]*?actions\.selectPanel\("build"\);[\s\S]*?requestAnimationFrame\(\(\) => \{[\s\S]*?isMobileNavigationVisible\(\)[\s\S]*?focusCommandPanel\(\);[\s\S]*?data-game-command-navigation="desktop"\] \[data-command-panel="build"\][\s\S]*?\.focus\(\);/,
  );
  assert.match(app, /data-game-command-navigation="\$\{selectedNavigation\}"/);
  assert.match(stories, /export const MobileVillageBuildNavigation/);
  assert.match(
    audit,
    /mobile-village-build-navigation-195\.png[\s\S]*?width: 195, height: 422/,
  );
  assert.match(
    audit,
    /Visible BuildPanel heading is covered by sticky HUD or bottom navigation/,
  );
  assert.match(audit, /headingHitIsHud/);
  assert.match(audit, /headingHitIsNav/);
});

test("resource header audit protects the narrow two-by-two layout without changing normal mobile widths", async () => {
  const [css, audit] = await Promise.all([
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(
      new URL("../scripts/capture-storybook-audit.mjs", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    css,
    /@media \(max-width: 220px\)\s*\{[\s\S]*?\.resource-hud\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
  );
  for (const width of [195, 320, 390])
    assert.match(
      audit,
      new RegExp(
        `mobile-resource-header-${width}\\.png[\\s\\S]*?width: ${width}, height: ${width === 195 ? 422 : 844}`,
      ),
    );
  assert.match(audit, /Narrow resource header must use a two-by-two grid/);
  assert.match(
    audit,
    /Normal-width resource header must keep one row of four resources/,
  );
  assert.match(audit, /extends outside its tile/);
  assert.match(audit, /Resource header has horizontal overflow/);
  assert.match(audit, /Resource settings control is smaller than 44px/);
});

test("dawn appearance keeps classic accessibility fallbacks and the settings option", async () => {
  const [css, settings] = await Promise.all([
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/SettingsDialog.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    settings,
    /<option value="dawn">\{props\.copy\.appearanceDawn\}<\/option>/,
  );
  const defaultDawnTokens = css.indexOf(
    '[data-village-appearance="dawn"] {\n  --village-frame-base: #4b341d;',
  );
  const defaultDawnTerrain = css.indexOf(
    '.village-map[data-village-appearance="dawn"] .village-map-terrain img {\n  filter: sepia(',
  );
  const highContrastFallback = css.indexOf(
    "@media (prefers-contrast: more) {\n  /* Dusk and Dawn are decorative.",
  );
  const forcedColorsFallback = css.indexOf(
    "@media (forced-colors: active) {",
    highContrastFallback,
  );
  assert.ok(defaultDawnTokens >= 0, "default Dawn tokens are present");
  assert.ok(defaultDawnTerrain >= 0, "default Dawn terrain filter is present");
  assert.ok(
    highContrastFallback > defaultDawnTokens &&
      highContrastFallback > defaultDawnTerrain,
    "high-contrast Dawn fallback follows every default Dawn declaration",
  );
  assert.ok(
    forcedColorsFallback > defaultDawnTerrain,
    "forced-colors Dawn fallback follows the default terrain filter",
  );
  const highContrastBlock = css.slice(
    highContrastFallback,
    forcedColorsFallback,
  );
  assert.match(highContrastBlock, /--village-frame-base:\s*#172516/);
  assert.match(
    highContrastBlock,
    /\[data-village-appearance="dawn"\][\s\S]*?--village-map-wash:\s*transparent/,
  );
  assert.match(highContrastBlock, /filter:\s*none/);
  assert.doesNotMatch(highContrastBlock, /!important/);
  const forcedColorsBlock = css.slice(forcedColorsFallback);
  assert.match(
    forcedColorsBlock,
    /\.game-shell\[data-village-appearance="dawn"\][\s\S]*?filter:\s*none[\s\S]*?background:\s*Canvas/,
  );
});

test("Dawn settings Storybook audit mirrors the Dusk mobile coverage", async () => {
  const [stories, audit] = await Promise.all([
    readFile(
      new URL(
        "../src/components/CivilizationUiAudit.stories.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../scripts/capture-storybook-audit.mjs", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    stories,
    /export const VillageAppearanceDawnSettings = \{[\s\S]*?data-village-appearance="dawn"[\s\S]*?appearance="dawn"/,
  );
  for (const width of [320, 390])
    assert.match(
      audit,
      new RegExp(
        `mobile-village-appearance-dawn-settings-${width}\\.png[\\s\\S]*?ui-audit-civilization--village-appearance-dawn-settings[\\s\\S]*?width: ${width}, height: 844`,
      ),
    );
  assert.match(
    audit,
    /ui-audit-civilization--village-appearance-dusk-settings[\s\S]*?ui-audit-civilization--village-appearance-dawn-settings/,
  );
  assert.match(
    audit,
    /ui-audit-civilization--village-appearance-dawn-settings[\s\S]*?page\.screenshot\(\{ path: join\(visualReview, name\), fullPage: true \}\)[\s\S]*?screenshotTaken = true/,
  );
  assert.match(audit, /Village appearance settings have horizontal overflow/);
  assert.match(
    audit,
    /Village appearance select or Apply\/Reset action is not a readable 44px target/,
  );
});
