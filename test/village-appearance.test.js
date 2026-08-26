import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_VILLAGE_APPEARANCE,
  resolveVillageAppearance,
} from "../src/lib/village-appearance.js";
import { createVillageAppearanceRoute } from "../server/village-appearance-route.js";

test("unknown presentation values fail safely to classic", () => {
  for (const value of [null, undefined, "night", {}, "DUSK"])
    assert.equal(resolveVillageAppearance(value), DEFAULT_VILLAGE_APPEARANCE);
  assert.equal(resolveVillageAppearance("dusk"), "dusk");
});

test("appearance API derives identity only from the authenticated session", async () => {
  let saved;
  const route = createVillageAppearanceRoute({
    database: () => ({}),
    expiredWalletAuthSessionCookie: () => "session=; Max-Age=0",
    readWalletAuthSession: async () => "0xSessionWallet",
    readVillageAppearance: async (_db, wallet) =>
      wallet === "0xSessionWallet" ? "dusk" : "classic",
    runtimeConfiguration: () => ({ ready: true }),
    saveVillageAppearance: async (_db, wallet, appearance) => {
      saved = { wallet, appearance };
      return appearance;
    },
  });
  const get = await route.GET(
    new Request("https://example.test/api/village-appearance", {
      headers: { cookie: "ignored" },
    }),
  );
  assert.deepEqual(await get.json(), { appearance: "dusk" });
  assert.equal(get.headers.get("cache-control"), "no-store");
  assert.equal(get.headers.get("vary"), "Cookie");
  const put = await route.PUT(
    new Request("https://example.test/api/village-appearance", {
      method: "PUT",
      body: JSON.stringify({ appearance: "dusk", walletAddress: "0xAttacker" }),
    }),
  );
  assert.equal(put.status, 200);
  assert.deepEqual(saved, { wallet: "0xSessionWallet", appearance: "dusk" });
});

test("appearance GET resolves malformed dependency output safely at its response boundary", async () => {
  const route = createVillageAppearanceRoute({
    database: () => ({}),
    expiredWalletAuthSessionCookie: () => "session=; Max-Age=0",
    readWalletAuthSession: async () => "0xSessionWallet",
    readVillageAppearance: async () => ({ appearance: "dusk" }),
    runtimeConfiguration: () => ({ ready: true }),
    saveVillageAppearance: async () => "classic",
  });
  const response = await route.GET(
    new Request("https://example.test/api/village-appearance"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { appearance: "classic" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
});

test("appearance GET returns an uncached safe fallback while unavailable", async () => {
  const route = createVillageAppearanceRoute({
    database: () => {
      throw new Error("database must not be used");
    },
    expiredWalletAuthSessionCookie: () => "session=; Max-Age=0",
    readWalletAuthSession: async () => "0xSessionWallet",
    readVillageAppearance: async () => "dusk",
    runtimeConfiguration: () => ({ ready: false }),
    saveVillageAppearance: async () => "classic",
  });
  const response = await route.GET(
    new Request("https://example.test/api/village-appearance"),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    appearance: "classic",
    error: "appearance_unavailable",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
});

test("appearance API rejects malformed input and clears invalid sessions", async () => {
  const route = createVillageAppearanceRoute({
    database: () => ({}),
    expiredWalletAuthSessionCookie: () => "session=; Max-Age=0",
    readWalletAuthSession: async () => null,
    readVillageAppearance: async () => "classic",
    runtimeConfiguration: () => ({ ready: true }),
    saveVillageAppearance: async () => "classic",
  });
  const response = await route.PUT(
    new Request("https://example.test/api/village-appearance", {
      method: "PUT",
      body: "{}",
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});

test("appearance API rejects malformed allowlist values without writing", async () => {
  let writes = 0;
  const route = createVillageAppearanceRoute({
    database: () => ({}),
    expiredWalletAuthSessionCookie: () => "session=; Max-Age=0",
    readWalletAuthSession: async () => "0xSessionWallet",
    readVillageAppearance: async () => "classic",
    runtimeConfiguration: () => ({ ready: true }),
    saveVillageAppearance: async () => {
      writes += 1;
      return "dusk";
    },
  });
  const response = await route.PUT(
    new Request("https://example.test/api/village-appearance", {
      method: "PUT",
      body: JSON.stringify({ appearance: "neon" }),
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    appearance: "classic",
    error: "invalid_appearance",
  });
  assert.equal(writes, 0);
});
