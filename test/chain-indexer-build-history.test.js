import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import {
  BUILDING_UPGRADED_SELECTOR,
  decodeBuildHistoryEvent,
  parseBuildHistoryQuery,
  readPersonalBuildHistory,
  UPGRADE_STARTED_SELECTOR,
} from "../server/chain-indexer-build-history.js";

const wallet = getAddress("0x00000000000000000000000000000000000000aa");
const other = getAddress("0x00000000000000000000000000000000000000bb");
const contract = "0x0000000000000000000000000000000000000abc";
const topic = (value) => `0x${value.toString(16).padStart(64, "0")}`;
const addressTopic = (address) => `0x${address.slice(2).padStart(64, "0")}`;
const base = {
  topics: [UPGRADE_STARTED_SELECTOR, addressTopic(wallet), topic(1)],
  data: topic(1_800_000_000),
  block_number: "42",
  block_timestamp: "2026-01-01T00:00:00.000Z",
  transaction_hash: `0x${"1".repeat(64)}`,
  log_index: 3,
};
function poolFor(rows, checkpointHash = `0x${"a".repeat(64)}`) {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.startsWith("SELECT block_number"))
        return {
          rowCount: 1,
          rows: [
            {
              block_number: "100",
              block_hash: checkpointHash,
              updated_at: "2026-01-02T00:00:00.000Z",
            },
          ],
        };
      if (sql.startsWith("SELECT e.block_number"))
        return { rowCount: rows.length, rows };
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  return {
    pool: {
      async connect() {
        return client;
      },
    },
    calls,
  };
}
test("strict build decoder accepts only owned canonical event facts and exposes no raw log", () => {
  const started = decodeBuildHistoryEvent(base, wallet);
  assert.deepEqual(
    { kind: started.kind, building: started.building, value: started.value },
    { kind: "upgrade_started", building: 1, value: "1800000000" },
  );
  assert.equal("topics" in started, false);
  assert.equal("data" in started, false);
  assert.equal(
    decodeBuildHistoryEvent(
      {
        ...base,
        topics: [BUILDING_UPGRADED_SELECTOR, addressTopic(wallet), topic(1)],
        data: topic(9),
      },
      wallet,
    ).kind,
    "building_upgraded",
  );
  assert.equal(
    decodeBuildHistoryEvent(
      {
        ...base,
        topics: [UPGRADE_STARTED_SELECTOR, addressTopic(other), topic(1)],
      },
      wallet,
    ),
    null,
  );
  assert.equal(
    decodeBuildHistoryEvent(
      { ...base, topics: [`0x${"0".repeat(64)}`, ...base.topics.slice(1)] },
      wallet,
    ),
    null,
  );
  assert.equal(
    decodeBuildHistoryEvent({ ...base, data: "0x00" }, wallet),
    null,
  );
  assert.equal(
    decodeBuildHistoryEvent(
      { ...base, transaction_hash: "not-a-hash" },
      wallet,
    ),
    null,
  );
  assert.equal(
    decodeBuildHistoryEvent(
      {
        ...base,
        topics: [UPGRADE_STARTED_SELECTOR, addressTopic(wallet), topic(8)],
      },
      wallet,
    ),
    null,
  );
});
test("build history pagination is wallet-private, deduplicable, and reset-safe", async () => {
  const newer = { ...base, block_number: "99", transaction_index: 1 };
  const older = {
    ...base,
    block_number: "98",
    transaction_index: 0,
    log_index: 2,
    transaction_hash: `0x${"2".repeat(64)}`,
  };
  const first = poolFor([newer, older]);
  const page = await readPersonalBuildHistory(first.pool, {
    chainId: "480",
    contractAddress: contract,
    walletAddress: wallet,
    limit: 1,
  });
  assert.equal(page.events.length, 1);
  assert.ok(page.nextCursor);
  assert.equal("walletAddress" in page, false);
  const query = first.calls.find((call) =>
    call.sql.startsWith("SELECT e.block_number"),
  );
  assert.deepEqual(query.parameters.slice(2, 4), [
    [UPGRADE_STARTED_SELECTOR, BUILDING_UPGRADED_SELECTOR],
    addressTopic(wallet).toLowerCase(),
  ]);
  await assert.rejects(
    readPersonalBuildHistory(poolFor([]).pool, {
      chainId: "480",
      contractAddress: contract,
      walletAddress: other,
      cursor: page.nextCursor,
    }),
    /invalid_build_history:cursor/,
  );
  await assert.rejects(
    readPersonalBuildHistory(poolFor([], `0x${"b".repeat(64)}`).pool, {
      chainId: "480",
      contractAddress: contract,
      walletAddress: wallet,
      cursor: page.nextCursor,
    }),
    /build_history_checkpoint_changed/,
  );
});
test("build query permits only pagination controls", () => {
  assert.deepEqual(parseBuildHistoryQuery(new URLSearchParams("limit=50")), {
    cursor: null,
    limit: 50,
  });
  assert.throws(
    () => parseBuildHistoryQuery(new URLSearchParams("wallet=x")),
    /invalid_build_history:query/,
  );
});
