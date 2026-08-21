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
import {
  MAP_BUILDING_ANCHORS,
  mapBuildingAnchorStyle,
} from "../src/game-ui/map-coordinates.js";
import { gameShell } from "../src/game-ui/views/shell.js";
import { buildPanel } from "../src/game-ui/views/build.js";
import { marketPanel } from "../src/game-ui/views/market.js";
import { armyPanel } from "../src/game-ui/views/army.js";
import { raidPanel } from "../src/game-ui/views/raid.js";
import { createWorldRuntime } from "../src/game-world-runtime.js";
import { createGameActions } from "../src/game-actions.js";
import { createInitialState } from "../src/game.js";
import { refreshGameTick } from "../src/game-tick.js";
import { civilizationMessages } from "../src/lib/civilization-locale.ts";
import { readFile } from "node:fs/promises";

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

test("shell rendering receives explicit state and no controller callbacks", () => {
  const state = {
    resources: { wood: 1, clay: 1, stone: 1, gold: 0 },
    unclaimed: { wood: 0, clay: 0, stone: 0, gold: 0 },
    buildings: {
      townhall: 1,
      timber: 1,
      claypit: 1,
      quarry: 1,
      warehouse: 1,
      workshop: 1,
      goldmine: 1,
      barracks: 1,
    },
    raids: 0,
  };
  const resourceDefs = {
    wood: { color: "wood", label: "Holz" },
    clay: { color: "clay", label: "Lehm" },
    stone: { color: "stone", label: "Stein" },
    gold: { color: "gold", label: "Gold" },
  };
  const tokens = {
    wood: { symbol: "HOLZ" },
    clay: { symbol: "LEHM" },
    stone: { symbol: "STEIN" },
    gold: { symbol: "CGOLD" },
  };
  const buildings = Object.fromEntries(
    Object.keys(state.buildings).map((id) => [id, { label: id }]),
  );
  const html = gameShell({
    state,
    runtimeMode: "demo",
    worldApp: { installed: false },
    worldBadge: "DEMO · LOKAL",
    feedback: "bereit",
    activePanel: "build",
    selectedBuilding: "townhall",
    panel: "<p>panel</p>",
    production: { wood: 1, clay: 1, stone: 1, gold: 0 },
    capacity: 100,
    displayState: state,
    collection: { locked: false, detail: "FELD" },
    readyToClaim: 0,
    resourceDefs,
    tokens,
    format: String,
    resourceFormat: String,
    buildings,
    busy: false,
    locale: "en-US",
    copy: civilizationMessages("en-US"),
    walletAddress: "0x0000000000000000000000000000000000000001",
    settingsOpen: true,
    reducedMotion: true,
  });
  assert.match(html, /data-panel="build"/);
  assert.match(
    html,
    /<nav class="command-tabs" aria-label="Village actions">[\s\S]*?data-panel="build"[^>]*aria-label="Build"[^>]*aria-current="page"/,
  );
  assert.match(
    html,
    /<nav class="mobile-hud" aria-label="Quick access">[\s\S]*?data-panel="build"[^>]*aria-label="Build"[^>]*aria-current="page"/,
  );
  assert.doesNotMatch(html, /role="tab"/);
  assert.equal(
    html.match(/aria-current="page"/g)?.length,
    2,
    "desktop and mobile navigation each expose exactly one current area",
  );
  assert.match(html, /id="game-command-panel"/);
  assert.match(html, /<p>panel<\/p>/);
  assert.match(html, /asset-loading/);
  assert.match(html, /id="gather"/);
  assert.match(html, /<div data-game-shell-hud><\/div>/);
  assert.match(html, /<div data-game-settings-dialog><\/div>/);
  assert.doesNotMatch(html, /settings-wallet-address/);
  assert.doesNotMatch(html, /data-reduced-motion/);
  assert.match(html, /motion-reduced/);
});

test("game feedback escapes dynamic contact, provider, and contract messages once", () => {
  const state = createInitialState();
  const feedback =
    '<img src=x onerror="globalThis.pwned=1"> "quoted" & Käse 🏰';
  const html = gameShell({
    state,
    runtimeMode: "demo",
    worldApp: { installed: false },
    worldBadge: "DEMO · LOKAL",
    feedback,
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
    copy: civilizationMessages("en-US"),
  });

  assert.match(
    html,
    /<p class="map-feedback" aria-live="polite">&lt;img src=x onerror=&quot;globalThis\.pwned=1&quot;&gt; &quot;quoted&quot; &amp; Käse 🏰<\/p>/,
  );
  assert.doesNotMatch(html, /<img src=x onerror=/);
});

test("game navigation exposes one current area per navigation and retains a visible focus treatment", async () => {
  const [css, bindings] = await Promise.all([
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../src/game-ui/bindings.js", import.meta.url), "utf8"),
  ]);

  assert.match(css, /\.game-shell button\s*\{\s*min-height:\s*2\.75rem/);
  assert.match(
    css,
    /\.game-shell button:focus-visible,[\s\S]*?outline:\s*3px solid #fff4bb[\s\S]*?box-shadow:\s*0 0 0 6px #07100e/,
  );
  assert.match(bindings, /requestAnimationFrame\(\(\)\s*=>/);
  assert.match(bindings, /querySelector\(focusSelector\)\?\.focus\(\)/);
});

test("failed resource and building sprites retain visible accessible fallbacks", () => {
  const state = {
    resources: { wood: 1 },
    unclaimed: { wood: 0 },
    buildings: Object.fromEntries(BUILDING_IDS.map((id) => [id, 1])),
    raids: 0,
  };
  const html = gameShell({
    state,
    runtimeMode: "demo",
    worldApp: { installed: false },
    worldBadge: "DEMO · LOKAL",
    feedback: "bereit",
    activePanel: "build",
    selectedBuilding: "townhall",
    panel: "",
    production: { wood: 0 },
    capacity: 100,
    displayState: state,
    collection: { locked: false, detail: "FELD" },
    readyToClaim: 0,
    resourceDefs: { wood: { color: "wood", label: "Holz" } },
    tokens: { wood: { symbol: "HOLZ" } },
    format: String,
    resourceFormat: String,
    buildings: Object.fromEntries(
      BUILDING_IDS.map((id) => [id, { label: id }]),
    ),
    busy: false,
    copy: civilizationMessages("de-DE"),
    assetResult: {
      failed: [
        "/assets/village-v2/resources/wood.png",
        "/assets/village-v2/buildings/townhall.png",
      ],
    },
  });
  assert.match(html, /map-townhall[^>]*has-asset-error/);
  assert.match(html, /collection-resource has-asset-error/);
  assert.match(html, /Holz-Symbol nicht verfügbar/);
  assert.match(html, /Rathaus-Symbol nicht verfügbar/);
  assert.match(html, /role="status"/);
  assert.match(html, /id="gather"/);
});

test("imperative shell uses the selected locale for navigation and dynamic claim values", () => {
  const state = {
    resources: { wood: 0, clay: 0, stone: 0, gold: 0 },
    unclaimed: { wood: 0, clay: 0, stone: 0, gold: 0 },
    buildings: Object.fromEntries(BUILDING_IDS.map((id) => [id, 1])),
    raids: 0,
  };
  const html = gameShell({
    state,
    runtimeMode: "demo",
    worldApp: { installed: false },
    worldBadge: "DEMO · LOCAL",
    feedback: "",
    activePanel: "build",
    selectedBuilding: "townhall",
    panel: "",
    production: {},
    capacity: 100,
    displayState: state,
    collection: { locked: false, detail: "FIELD" },
    readyToClaim: 1234.5,
    resourceDefs: {},
    tokens: {},
    format: String,
    resourceFormat: (value) => new Intl.NumberFormat("en-US").format(value),
    buildings: Object.fromEntries(
      BUILDING_IDS.map((id) => [id, { label: id }]),
    ),
    busy: false,
    locale: "en-US",
    copy: civilizationMessages("en-US"),
  });
  assert.match(html, /aria-label="Village actions"/);
  assert.match(html, /1,234\.5 collect/);
  assert.match(html, /data-game-shell-hud/);
});

test("market panel is a stable React mount point", () => {
  assert.equal(marketPanel(), "<div data-game-market-panel></div>");
});

test("raid panel is a stable React mount point", () => {
  assert.equal(raidPanel(), "<div data-game-raid-panel></div>");
});

test("all imperative game panels render catalog copy for German and English", () => {
  const state = {
    resources: { wood: 100, clay: 100, stone: 100, gold: 10 },
    buildings: { townhall: 1, barracks: 1 },
    troops: { spear: 2 },
    targets: [],
    raids: 0,
    lastRaid: null,
  };
  const panelContext = (locale) => ({
    state,
    runtimeMode: "demo",
    busy: false,
    copy: civilizationMessages(locale),
    selectedBuilding: "townhall",
    buildings: {
      townhall: {
        label: civilizationMessages(locale).buildingNames.townhall,
        detail: civilizationMessages(locale).buildingDetails.townhall,
      },
    },
    troops: {
      spear: {
        label: civilizationMessages(locale).troopNames.spear,
        attack: 10,
        cost: { wood: 1 },
      },
    },
    resourceDefs: {
      wood: {
        label: civilizationMessages(locale).resourceNames.wood,
        color: "wood",
      },
    },
    tokens: {
      wood: {
        name: civilizationMessages(locale).resourceNames.wood,
        symbol: "WOOD",
        externalSettlement: false,
      },
    },
    format: (value) => new Intl.NumberFormat(locale).format(value),
    remainingTime: () => 0,
    requirements: () => [],
    buildingCost: () => ({ wood: 1 }),
    buildDuration: () => 0,
    nextBuildingProduction: () => ({}),
    troopRequirements: () => [],
  });
  const german = panelContext("de-DE");
  const english = panelContext("en-US");
  assert.equal(buildPanel(german), "<div data-game-build-panel></div>");
  assert.equal(buildPanel(english), "<div data-game-build-panel></div>");
  assert.equal(armyPanel(german), "<div data-game-army-panel></div>");
  assert.equal(armyPanel(english), "<div data-game-army-panel></div>");
  assert.equal(raidPanel(german), "<div data-game-raid-panel></div>");
  assert.equal(raidPanel(english), "<div data-game-raid-panel></div>");
  assert.equal(marketPanel(german), "<div data-game-market-panel></div>");
  assert.equal(marketPanel(english), "<div data-game-market-panel></div>");
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
  const initial = gameShell(context);
  const updated = gameShell({
    ...context,
    state: { ...state, buildings: { ...state.buildings, quarry: 2 } },
    selectedBuilding: "quarry",
  });

  for (const id of ids) {
    const style = mapBuildingAnchorStyle(id);
    const anchor = new RegExp(
      `map-${id}[^>]*data-map-anchor="bottom-center"[^>]*style="${style}"`,
    );
    assert.match(initial, anchor, `${id} is anchored on the initial render`);
    assert.match(
      updated,
      anchor,
      `${id} retains its point after state updates`,
    );
  }

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

test("imperative shell omits the React HUD while collect status exposes field stock once", () => {
  const state = {
    resources: { wood: 2_410_426_546, clay: 1, stone: 1, gold: 0 },
    unclaimed: { wood: 4, clay: 0, stone: 0, gold: 0 },
    buildings: {
      townhall: 1,
      timber: 1,
      claypit: 1,
      quarry: 1,
      warehouse: 1,
      workshop: 1,
      goldmine: 0,
      barracks: 1,
    },
    raids: 0,
  };
  const common = {
    copy: civilizationMessages("de-DE"),
    state,
    worldApp: { installed: false },
    worldBadge: "DEMO · LOKAL",
    feedback: "bereit",
    activePanel: "build",
    selectedBuilding: "townhall",
    panel: "",
    capacity: 100,
    displayState: state,
    collection: { locked: false, detail: "FELD" },
    readyToClaim: 4,
    resourceDefs: {
      wood: { color: "wood", label: "Holz" },
      gold: { color: "gold", label: "Gold" },
    },
    tokens: { wood: { symbol: "HOLZ" }, gold: { symbol: "CGOLD" } },
    format: String,
    resourceFormat: String,
    buildings: Object.fromEntries(
      Object.keys(state.buildings).map((id) => [id, { label: id }]),
    ),
    busy: false,
  };
  const demo = gameShell({
    ...common,
    runtimeMode: "demo",
    production: { wood: 35_100, gold: 0 },
  });
  const world = gameShell({
    ...common,
    runtimeMode: "world",
    production: { wood: 35_100, gold: 0 },
  });

  assert.match(demo, /<div data-game-shell-hud><\/div>/);
  assert.doesNotMatch(demo, /data-resource="wood"/);
  assert.doesNotMatch(demo, /data-resource-field|Feldbestand/);
  assert.match(
    demo,
    /class="collection-resources" aria-hidden="true">[\s\S]*data-collection-resource="wood"[\s\S]*<img [^>]*alt=""[^>]*>[\s\S]*data-collection-resource-value>4<\/b>/,
  );
  assert.match(
    demo,
    /Feldressourcen: Holz <span data-collection-resource-accessible="wood">4<\/span>; Gold <span data-collection-resource-accessible="gold">0<\/span>\./,
  );
  assert.match(
    demo,
    /data-ready-to-claim aria-hidden="true">4 sammeln<\/b>[\s\S]*data-ready-to-claim-accessible>4 sammeln<\/span>/,
  );
  assert.match(world, /<div data-game-shell-hud><\/div>/);
});

test("mobile HUD keeps all four resources in one bounded row", async () => {
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
  assert.doesNotMatch(
    css,
    /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
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

test("parallel construction keeps job controls and the start composer visible", () => {
  const context = ({
    workshop,
    constructions,
    selectedBuilding = "timber",
  }) => ({
    state: {
      resources: { wood: 999, clay: 999, stone: 999, gold: 999 },
      buildings: { timber: 1, workshop },
      constructions,
      construction: constructions[0],
      constructionOccupied: constructions.length,
      constructionCapacity: workshop >= 21 ? 3 : 2,
    },
    selectedBuilding,
    buildings: {
      timber: { label: "Holzfäller", detail: "Erzeugt Holz.", produces: {} },
      quarry: { label: "Steinbruch", detail: "Erzeugt Stein.", produces: {} },
    },
    requirements: () => [],
    buildingCost: () => ({ wood: 1, clay: 1, stone: 1, gold: 0 }),
    runtimeMode: "world",
    resourceDefs: { wood: {}, clay: {}, stone: {}, gold: {} },
    format: String,
    buildDuration: () => 3_600,
    nextBuildingProduction: () => ({}),
    remainingTime: () => 3_600,
    busy: false,
  });
  const workshop11 = buildPanel(
    context({
      workshop: 11,
      constructions: [
        { pending: true, buildingId: "quarry", completesAt: 1, slot: 0 },
      ],
    }),
  );
  assert.equal(workshop11, "<div data-game-build-panel></div>");

  const workshop21 = buildPanel(
    context({
      workshop: 21,
      constructions: [
        { pending: true, buildingId: "quarry", completesAt: 1, slot: 0 },
        { pending: true, buildingId: "timber", completesAt: 1, slot: 1 },
      ],
    }),
  );
  assert.equal(workshop21, "<div data-game-build-panel></div>");
});

test("full construction capacity disables only a new start and states the exact occupancy", () => {
  const panel = buildPanel({
    state: {
      resources: { wood: 999, clay: 999, stone: 999, gold: 999 },
      buildings: { timber: 1, workshop: 11 },
      constructions: [
        { pending: true, buildingId: "timber", completesAt: 1, slot: 0 },
        { pending: true, buildingId: "timber", completesAt: 1, slot: 1 },
      ],
      constructionOccupied: 2,
      constructionCapacity: 2,
    },
    selectedBuilding: "timber",
    buildings: { timber: { label: "Holzfäller", detail: "", produces: {} } },
    requirements: () => [],
    buildingCost: () => ({ wood: 1, clay: 1, stone: 1, gold: 0 }),
    runtimeMode: "world",
    resourceDefs: { wood: {}, clay: {}, stone: {}, gold: {} },
    format: String,
    buildDuration: () => 3_600,
    nextBuildingProduction: () => ({}),
    remainingTime: () => 0,
    busy: false,
  });
  assert.equal(panel, "<div data-game-build-panel></div>");
});

test("app lifecycle keeps React panel controls out of imperative bindings and rerenders them on ticks", async () => {
  const [app, armyPanel, marketPanel, raidPanel, bindings, tick] =
    await Promise.all([
      readFile(new URL("../src/app.js", import.meta.url), "utf8"),
      readFile(
        new URL("../src/components/ArmyPanel.tsx", import.meta.url),
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
      readFile(new URL("../src/game-ui/bindings.js", import.meta.url), "utf8"),
      readFile(new URL("../src/game-tick.js", import.meta.url), "utf8"),
    ]);
  assert.match(app, /export function startCivilizationApp/);
  assert.match(app, /export function stopCivilizationApp/);
  assert.match(app, /clearInterval\(runtime\.timer\)/);
  assert.match(app, /refreshTicks: 0/);
  assert.match(app, /runtime\.refreshTicks >= 30/);
  assert.match(app, /game-ui/);
  assert.doesNotMatch(app, /isConnected/);
  assert.match(bindings, /export function bindGameActions/);
  assert.ok(
    app.indexOf("bindGameActions(runtime.root, actions)") <
      app.indexOf("renderBuildPanel();"),
  );
  assert.ok(
    app.indexOf("bindGameActions(runtime.root, actions)") <
      app.indexOf("renderArmyPanel();"),
  );
  assert.ok(
    app.indexOf("bindGameActions(runtime.root, actions)") <
      app.indexOf("renderMarketPanel();"),
  );
  assert.ok(
    app.indexOf("bindGameActions(runtime.root, actions)") <
      app.indexOf("renderRaidPanel();"),
  );
  const tickRefresh = app.slice(app.indexOf("const refreshTickValues"));
  assert.ok(
    tickRefresh.indexOf("refreshGameTick({") <
      tickRefresh.indexOf("renderBuildPanel();"),
  );
  assert.ok(
    tickRefresh.indexOf("refreshGameTick({") <
      tickRefresh.indexOf("renderArmyPanel();"),
  );
  assert.ok(
    tickRefresh.indexOf("refreshGameTick({") <
      tickRefresh.indexOf("renderMarketPanel();"),
  );
  assert.ok(
    tickRefresh.indexOf("refreshGameTick({") <
      tickRefresh.indexOf("renderRaidPanel();"),
  );
  assert.doesNotMatch(bindings, /data-train/);
  assert.doesNotMatch(
    bindings,
    /market-(?:swap|quote|buy|sell|resource|amount)/,
  );
  assert.doesNotMatch(bindings, /(?:send|resolve)-raid|pick-raid-contact/);
  assert.doesNotMatch(tick, /data-construction-countdown/);
  assert.doesNotMatch(tick, /data-complete-upgrade/);
  assert.doesNotMatch(tick, /data-boost-construction/);
  assert.match(armyPanel, /data-asset-container/);
  assert.match(armyPanel, /onError=/);
  assert.match(armyPanel, /classList\.add\("has-asset-error"\)/);
  assert.match(armyPanel, /asset-building-fallback" role="status"/);
  assert.match(marketPanel, /onDraftChange/);
  assert.match(marketPanel, /quoteMatchesDraft/);
  assert.match(raidPanel, /onPickOpponent/);
  assert.match(raidPanel, /targetAddress/);
  assert.match(raidPanel, /data-raid-countdown/);
  assert.doesNotMatch(tick, /data-raid-countdown/);
});

test("settings dialog is a typed React island with runtime-owned actions and keyboard lifecycle", async () => {
  const [app, shell, bindings, settings, hud] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/game-ui/views/shell.js", import.meta.url), "utf8"),
    readFile(new URL("../src/game-ui/bindings.js", import.meta.url), "utf8"),
    readFile(
      new URL("../src/components/SettingsDialog.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/components/GameShellHud.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(shell, /<div data-game-settings-dialog><\/div>/);
  assert.doesNotMatch(shell, /function settingsDialog/);
  assert.match(app, /import \{ SettingsDialog \}/);
  assert.match(app, /settingsDialogRoot/);
  assert.match(app, /createElement\(SettingsDialog/);
  assert.match(app, /onChangeLocale: actions\.changeLocale/);
  assert.match(app, /onSetReducedMotion: actions\.setReducedMotion/);
  assert.match(app, /onLogout: actions\.logout/);
  assert.ok(
    app.indexOf("bindGameActions(runtime.root, actions)") <
      app.indexOf("renderSettingsDialog();"),
  );
  assert.doesNotMatch(bindings, /data-(?:open|close)-settings/);
  assert.doesNotMatch(bindings, /data-(?:copy-wallet|reduced-motion|logout)/);
  assert.doesNotMatch(bindings, /civilization-locale/);
  assert.match(settings, /export type SettingsDialogProps/);
  assert.match(settings, /navigator\.clipboard\?\.writeText/);
  assert.match(settings, /event\.key === "Escape"/);
  assert.match(settings, /event\.key !== "Tab"/);
  assert.match(settings, /\[data-close-settings\].*\.focus\(\)/);
  assert.match(settings, /aria-modal="true"/);
  assert.match(settings, /aria-live="polite"/);
  assert.match(settings, /checked=\{props\.reducedMotion\}/);
  assert.match(settings, /logoutPending \? props\.copy\.logoutPending/);
  assert.match(hud, /data-open-settings/);
  assert.match(hud, /aria-label=\{props\.copy\.settings\}/);
  assert.match(hud, /title=\{props\.copy\.settings\}/);
  assert.match(hud, /<span aria-hidden="true">⚙<\/span>/);
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

test("second tick updates collect stock and claim controls", () => {
  const nodes = new Map();
  const add = (selector, node = {}) => {
    nodes.set(selector, node);
    return node;
  };
  const claimStatus = {};
  const gather = add("#gather", { querySelector: () => claimStatus });
  const collectionValue = add(
    '[data-collection-resource="wood"] [data-collection-resource-value]',
    {},
  );
  const accessibleCollectionValue = add(
    '[data-collection-resource-accessible="wood"]',
    {},
  );
  const claim = add("[data-ready-to-claim]", {});
  const accessibleClaim = add("[data-ready-to-claim-accessible]", {});
  const root = { querySelector: (selector) => nodes.get(selector) || null };
  refreshGameTick({
    root,
    busy: false,
    mode: "world",
    production: { wood: 35_100 },
    displayState: { unclaimed: { wood: 2_410_426_546 } },
    collection: { locked: false, detail: "FELD" },
    resourceFormat: String,
  });
  assert.equal(collectionValue.textContent, "2,4Mrd");
  assert.equal(accessibleCollectionValue.textContent, "2410426546");
  assert.equal(claim.textContent, "2410426546 sammeln");
  assert.equal(accessibleClaim.textContent, "2410426546 sammeln");
  assert.equal(claimStatus.textContent, "FELD");
  assert.equal(gather.disabled, false);
});

test("boost UI is clickable at exactly one hour and explains guarded states", () => {
  const context = (remainingSeconds, busy = false) => ({
    state: {
      construction: {
        pending: true,
        buildingId: "timber",
        completesAt: 10_000_000,
        slot: 0,
      },
      buildings: { timber: 1 },
    },
    buildings: { timber: { label: "Holzfäller" } },
    busy,
    remainingTime: () => remainingSeconds,
  });
  const valid = buildPanel({
    ...context(3_600),
    selectedBuilding: "timber",
    requirements: () => [],
    buildingCost: () => ({}),
    runtimeMode: "world",
    resourceDefs: {},
    format: String,
    buildDuration: () => null,
    nextBuildingProduction: () => ({}),
  });
  assert.equal(valid, "<div data-game-build-panel></div>");

  const tooShort = buildPanel({
    ...context(3_599),
    selectedBuilding: "timber",
    requirements: () => [],
    buildingCost: () => ({}),
    runtimeMode: "world",
    resourceDefs: {},
    format: String,
    buildDuration: () => null,
    nextBuildingProduction: () => ({}),
  });
  assert.equal(tooShort, "<div data-game-build-panel></div>");

  const pending = buildPanel({
    ...context(4_000, true),
    selectedBuilding: "timber",
    requirements: () => [],
    buildingCost: () => ({}),
    runtimeMode: "world",
    resourceDefs: {},
    format: String,
    buildDuration: () => null,
    nextBuildingProduction: () => ({}),
  });
  assert.equal(pending, "<div data-game-build-panel></div>");
});

test("ticks update collect stock without writing React-owned production nodes", () => {
  const nodes = new Map();
  const add = (selector, node = {}) => nodes.set(selector, node);
  const collectionValue = {};
  const accessibleCollectionValue = {};
  add(
    '[data-collection-resource="gold"] [data-collection-resource-value]',
    collectionValue,
  );
  add(
    '[data-collection-resource-accessible="gold"]',
    accessibleCollectionValue,
  );
  const root = { querySelector: (selector) => nodes.get(selector) || null };
  const tick = (rate, stock) =>
    refreshGameTick({
      root,
      busy: false,
      mode: "demo",
      production: { gold: rate },
      displayState: { unclaimed: { gold: stock } },
      collection: { locked: false, detail: "FELD" },
      resourceFormat: String,
      remainingTime: () => 0,
      state: {},
    });

  tick(0, 3);
  assert.equal(collectionValue.textContent, "3");
  tick(1, 4);
  assert.equal(collectionValue.textContent, "4");
  tick(0, 5);
  assert.equal(collectionValue.textContent, "5");
  tick(Number.NaN, 6);
  assert.equal(collectionValue.textContent, "6");

  tick(-1, 7);
  tick(Infinity, 8);
});

test("ticks update collect stock without a matching production entry", () => {
  const nodes = new Map();
  const add = (selector, node = {}) => {
    nodes.set(selector, node);
    return node;
  };
  const collectionValue = add(
    '[data-collection-resource="clay"] [data-collection-resource-value]',
    {},
  );
  const accessibleCollectionValue = add(
    '[data-collection-resource-accessible="clay"]',
    {},
  );
  const root = { querySelector: (selector) => nodes.get(selector) || null };

  refreshGameTick({
    root,
    busy: false,
    mode: "demo",
    production: {},
    displayState: { unclaimed: { clay: 9 } },
    collection: { locked: false, detail: "FELD" },
    resourceFormat: String,
    remainingTime: () => 0,
    state: {},
  });

  assert.equal(collectionValue.textContent, "9");
  assert.equal(accessibleCollectionValue.textContent, "9");
});
