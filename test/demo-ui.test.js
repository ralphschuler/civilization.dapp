import test from "node:test";
import assert from "node:assert/strict";
import { clock, escapeHtml, remainingTime } from "../src/game-ui/helpers.js";
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
  const claim = add("[data-ready-to-claim]", {});
  const root = { querySelector: (selector) => nodes.get(selector) || null };
  refreshGameTick({
    root,
    busy: false,
    mode: "world",
    production: { wood: 2 },
    displayState: { unclaimed: { wood: 3 } },
    collection: { locked: false, detail: "FELD" },
    resourceFormat: String,
    remainingTime: (value) => value,
    state: {
      pendingRaid: { arrivesAt: 0 },
      construction: { pending: true, completesAt: 4_000 },
    },
  });
  assert.equal(field.textContent, "Feld 3 · +2/Tag");
  assert.equal(claim.textContent, "3 sammeln");
  assert.equal(claimStatus.textContent, "FELD");
  assert.equal(raid.textContent, "00:00");
  assert.equal(resolve.textContent, "Schlacht auswerten");
  assert.equal(construction.textContent, "01:06:40");
  assert.equal(complete.disabled, true);
  assert.equal(boost.disabled, false);
  assert.equal(gather.disabled, false);
});
