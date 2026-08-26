import assert from "node:assert/strict";
import test from "node:test";
import { createRaidHistoryGet } from "../server/chain-indexer-raid-history-route.js";

const wallet = "0x00000000000000000000000000000000000000AA";
const configuration = {
  ready: true,
  world: { worldChainId: 480, civilizationContractAddress: "0xcontract" },
};

function handler(overrides = {}) {
  let historyOptions;
  const get = createRaidHistoryGet({
    database: () => ({ name: "private-pool" }),
    expiredWalletAuthSessionCookie: () => "session=; Max-Age=0",
    parseRaidHistoryQuery: () => ({ cursor: null, limit: 20 }),
    readPersonalRaidHistory: async (_pool, options) => {
      historyOptions = options;
      return {
        events: [{ role: "attacker", counterparty: "0xother" }],
        nextCursor: null,
      };
    },
    readWalletAuthSession: async () => wallet,
    runtimeConfiguration: () => configuration,
    ...overrides,
  });
  return { get, historyOptions: () => historyOptions };
}

async function response(get, url = "https://example.test/api/history/raids") {
  return get(new Request(url, { headers: { cookie: "session=opaque" } }));
}

test("raid history route has private no-store responses for 200, 401, 400, 409, and 503", async () => {
  const cases = [
    [200, handler(), undefined],
    [
      401,
      handler({ readWalletAuthSession: async () => null }),
      "invalid_or_expired_session",
    ],
    [
      400,
      handler({
        parseRaidHistoryQuery: () => {
          throw new Error("invalid_raid_history:limit");
        },
      }),
      "invalid_history_query",
    ],
    [
      409,
      handler({
        readPersonalRaidHistory: async () => {
          throw new Error("raid_history_checkpoint_changed");
        },
      }),
      "history_snapshot_changed",
    ],
    [
      503,
      handler({ runtimeConfiguration: () => ({ ready: false }) }),
      "raid_history_unavailable",
    ],
    [
      503,
      handler({
        readPersonalRaidHistory: async () => {
          throw new Error("raid_history_stored_history_corruption:topics");
        },
      }),
      "raid_history_unavailable",
    ],
  ];
  for (const [status, route, error] of cases) {
    const result = await response(route.get);
    assert.equal(result.status, status);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.get("vary"), "Cookie");
    const body = await result.json();
    if (error) assert.equal(body.error, error);
    else {
      assert.equal("walletAddress" in body, false);
      assert.equal("topics" in body.events[0], false);
      assert.equal("data" in body.events[0], false);
      assert.equal(route.historyOptions().walletAddress, wallet);
    }
    if (status === 401)
      assert.match(result.headers.get("set-cookie"), /Max-Age=0/);
    else assert.equal(result.headers.get("set-cookie"), null);
  }
});
