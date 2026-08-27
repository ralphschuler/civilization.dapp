import assert from "node:assert/strict";
import test from "node:test";
import { createBuildHistoryGet } from "../server/chain-indexer-build-history-route.js";
const wallet = "0x00000000000000000000000000000000000000AA";
const configuration = {
  ready: true,
  world: { worldChainId: 480, civilizationContractAddress: "0xcontract" },
};
function handler(overrides = {}) {
  let options;
  const get = createBuildHistoryGet({
    database: () => ({ private: true }),
    expiredWalletAuthSessionCookie: () => "session=; Max-Age=0",
    parseBuildHistoryQuery: () => ({ cursor: null, limit: 20 }),
    readPersonalBuildHistory: async (_pool, value) => {
      options = value;
      return {
        availability: "stored_finalized_events",
        coverage: { complete: false },
        events: [{ kind: "upgrade_started", building: 1, value: "1" }],
        nextCursor: null,
      };
    },
    readWalletAuthSession: async () => wallet,
    runtimeConfiguration: () => configuration,
    ...overrides,
  });
  return { get, options: () => options };
}
test("build history route is authenticated, no-store, same-origin private output", async () => {
  const route = handler();
  const response = await route.get(
    new Request("https://example.test/api/history/builds", {
      headers: { cookie: "session=opaque" },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
  const body = await response.json();
  assert.equal("walletAddress" in body, false);
  assert.equal("topics" in body.events[0], false);
  assert.equal(route.options().walletAddress, wallet);
  const expired = await handler({
    readWalletAuthSession: async () => null,
  }).get(new Request("https://example.test/api/history/builds"));
  assert.equal(expired.status, 401);
  assert.match(expired.headers.get("set-cookie"), /Max-Age=0/);
  const reset = await handler({
    readPersonalBuildHistory: async () => {
      throw new Error("build_history_checkpoint_changed");
    },
  }).get(new Request("https://example.test/api/history/builds"));
  assert.equal(reset.status, 409);
});
