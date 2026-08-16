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
import { STORAGE_KEY } from "../src/game-ui/constants.js";
import { gameShell } from "../src/game-ui/views/shell.js";
import { createWorldRuntime } from "../src/game-world-runtime.js";
import { refreshGameTick } from "../src/game-tick.js";
import { readFile } from "node:fs/promises";

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
  });
  assert.match(html, /data-panel="build"/);
  assert.match(html, /<p>panel<\/p>/);
});

test("resource HUD keeps field stock and positive production distinct in Demo and World", () => {
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

  assert.match(demo, /data-resource-field>Feld 4<\/em>/);
  assert.match(demo, /data-resource-value>2,4Mrd<\/strong>/);
  assert.match(
    demo,
    /data-resource-production aria-hidden="true" ><span class="resource-production-label">Produktion <\/span><span data-resource-production-value>\+35,1K\/s/,
  );
  assert.match(
    world,
    /data-resource-production aria-hidden="true" ><span class="resource-production-label">Produktion <\/span><span data-resource-production-value>\+35,1K\/Tag/,
  );
  assert.match(demo, /role="group" aria-label="Holz"/);
  assert.doesNotMatch(demo, /aria-describedby=/);
  assert.match(demo, /class="resource-values" aria-hidden="true"/);
  assert.match(
    demo,
    /class="resource-accessibility">[\s\S]*role="progressbar" aria-label="Holz-Speicher"[\s\S]*aria-valuetext="2410426546 von 100"[\s\S]*Feldbestand:[\s\S]*Produktion: \+35100\/s/,
  );
  assert.doesNotMatch(world, /data-resource="gold"[\s\S]*?storage-capacity/);
  assert.match(
    world,
    /data-resource="gold"[\s\S]*?data-resource-production aria-hidden="true" hidden>[\s\S]*?data-resource-production-value><\/span><\/em>/,
  );
  assert.doesNotMatch(world, /Gold[\s\S]*?Produktion \+0/);
});

test("mobile HUD keeps all four resources in one bounded row", async () => {
  const css = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  const mobile = css.slice(css.indexOf("@media (max-width: 640px)"));
  assert.match(mobile, /\.resource-field\s*\{\s*display: none/);
  assert.match(
    mobile,
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
  assert.doesNotMatch(mobile, /\.resource em\s*\{\s*display: none/);
});

test("app lifecycle owns timer setup and teardown while bindings live outside markup", async () => {
  const [app, bindings] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/game-ui/bindings.js", import.meta.url), "utf8"),
  ]);
  assert.match(app, /export function startCivilizationApp/);
  assert.match(app, /export function stopCivilizationApp/);
  assert.match(app, /clearInterval\(runtime\.timer\)/);
  assert.match(app, /refreshTicks: 0/);
  assert.match(app, /runtime\.refreshTicks >= 30/);
  assert.match(app, /game-ui/);
  assert.doesNotMatch(app, /isConnected/);
  assert.match(bindings, /export function bindGameActions/);
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
  });
  const refresh = world.refresh();
  await world.performAction("claim", {}, "fertig");
  resolveRead({ version: "stale-read" });
  await refresh;
  assert.equal(runtime.state.version, "receipt");
  assert.equal(runtime.worldStateEpoch, 1);
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
  });
  world.requestBuildDuration("townhall", 2, 30);
  current = false;
  resolveDuration(60);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runtime.durations.get("townhall:2"), null);
});

test("second tick updates field, claim, construction, and raid controls", () => {
  const nodes = new Map();
  const add = (selector, node = {}) => {
    nodes.set(selector, node);
    return node;
  };
  const claimStatus = {};
  const gather = add("#gather", { querySelector: () => claimStatus });
  const raid = add("[data-raid-countdown]", {});
  const resolve = add("#resolve-raid", {});
  const construction = add("[data-construction-countdown]", {});
  const complete = add("#complete-upgrade", {});
  const boost = add("#boost-construction", {});
  const field = add('[data-resource="wood"] [data-resource-field]', {});
  const production = add(
    '[data-resource="wood"] [data-resource-production]',
    {},
  );
  const productionValue = add(
    '[data-resource="wood"] [data-resource-production-value]',
    {},
  );
  const accessibleField = add(
    '[data-resource="wood"] [data-resource-accessible-field]',
    {},
  );
  const accessibleProduction = add(
    '[data-resource="wood"] [data-resource-accessible-production]',
    {},
  );
  const claim = add("[data-ready-to-claim]", {});
  const root = { querySelector: (selector) => nodes.get(selector) || null };
  refreshGameTick({
    root,
    busy: false,
    mode: "world",
    production: { wood: 35_100 },
    displayState: { unclaimed: { wood: 2_410_426_546 } },
    collection: { locked: false, detail: "FELD" },
    resourceFormat: String,
    remainingTime: (value) => value,
    state: {
      pendingRaid: { arrivesAt: 0 },
      construction: { pending: true, completesAt: 4_000 },
    },
  });
  assert.equal(field.textContent, "Feld 2,4Mrd");
  assert.equal(productionValue.textContent, "+35,1K/Tag");
  assert.equal(production.hidden, false);
  assert.equal(accessibleField.textContent, "2410426546");
  assert.equal(accessibleProduction.textContent, "Produktion: +35100/Tag");
  assert.equal(claim.textContent, "2410426546 sammeln");
  assert.equal(claimStatus.textContent, "FELD");
  assert.equal(raid.textContent, "00:00");
  assert.equal(resolve.textContent, "Schlacht auswerten");
  assert.equal(construction.textContent, "01:06:40");
  assert.equal(complete.disabled, true);
  assert.equal(boost.disabled, false);
  assert.equal(gather.disabled, false);
});

test("ticks reveal and hide production independently without rerendering", () => {
  const nodes = new Map();
  const add = (selector, node = {}) => nodes.set(selector, node);
  const field = {};
  const production = {};
  const productionValue = {};
  const accessibleField = {};
  const accessibleProduction = {};
  add('[data-resource="gold"] [data-resource-field]', field);
  add('[data-resource="gold"] [data-resource-production]', production);
  add(
    '[data-resource="gold"] [data-resource-production-value]',
    productionValue,
  );
  add(
    '[data-resource="gold"] [data-resource-accessible-field]',
    accessibleField,
  );
  add(
    '[data-resource="gold"] [data-resource-accessible-production]',
    accessibleProduction,
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
  assert.equal(field.textContent, "Feld 3");
  assert.equal(productionValue.textContent, "");
  assert.equal(production.hidden, true);
  tick(1, 4);
  assert.equal(field.textContent, "Feld 4");
  assert.equal(productionValue.textContent, "+1/s");
  assert.equal(production.hidden, false);
  tick(0, 5);
  assert.equal(field.textContent, "Feld 5");
  assert.equal(productionValue.textContent, "");
  assert.equal(production.hidden, true);
  assert.equal(accessibleProduction.hidden, true);
  tick(Number.NaN, 6);
  assert.equal(field.textContent, "Feld 6");
  assert.equal(productionValue.textContent, "");
  assert.equal(production.hidden, true);

  tick(-1, 7);
  assert.equal(productionValue.textContent, "");
  assert.equal(production.hidden, true);
  tick(Infinity, 8);
  assert.equal(productionValue.textContent, "");
  assert.equal(production.hidden, true);
});

test("ticks update field stock without a matching production entry", () => {
  const nodes = new Map();
  const add = (selector, node = {}) => {
    nodes.set(selector, node);
    return node;
  };
  const field = add('[data-resource="clay"] [data-resource-field]', {});
  const accessibleField = add(
    '[data-resource="clay"] [data-resource-accessible-field]',
    {},
  );
  const production = add(
    '[data-resource="clay"] [data-resource-production]',
    {},
  );
  const productionValue = add(
    '[data-resource="clay"] [data-resource-production-value]',
    {},
  );
  const accessibleProduction = add(
    '[data-resource="clay"] [data-resource-accessible-production]',
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

  assert.equal(field.textContent, "Feld 9");
  assert.equal(accessibleField.textContent, "9");
  assert.equal(productionValue.textContent, "");
  assert.equal(production.hidden, true);
  assert.equal(accessibleProduction.hidden, true);
});
