import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import {
  decodeRaidResolved,
  parseRaidHistoryQuery,
  RAID_RESOLVED_SELECTOR,
  readPersonalRaidHistory,
} from "../server/chain-indexer-raid-history.js";

const attacker = getAddress("0x00000000000000000000000000000000000000aa");
const defender = getAddress("0x00000000000000000000000000000000000000bb");
const addressTopic = (address) => `0x${address.slice(2).padStart(64, "0")}`;
const word = (value) => BigInt(value).toString(16).padStart(64, "0");
const row = {
  topics: [
    RAID_RESOLVED_SELECTOR,
    addressTopic(attacker),
    addressTopic(defender),
  ],
  data: `0x${[1, 10, 20, 30, 40, 50, 60].map(word).join("")}`,
  block_number: "42",
  block_timestamp: "2026-01-01T00:00:00.000Z",
  transaction_hash: `0x${"1".padStart(64, "0")}`,
  log_index: 3,
};

const contract = "0x0000000000000000000000000000000000000abc";
const checkpoint = {
  block_number: "100",
  block_hash: `0x${"a".repeat(64)}`,
  updated_at: "2026-01-02T00:00:00.000Z",
};

function historyRow(blockNumber, transactionIndex, logIndex, hashDigit) {
  return {
    ...row,
    block_number: String(blockNumber),
    transaction_index: transactionIndex,
    log_index: logIndex,
    transaction_hash: `0x${hashDigit.repeat(64)}`,
  };
}

function poolFor({ rows, checkpointRow = checkpoint }) {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (sql.startsWith("SELECT block_number"))
        return { rowCount: 1, rows: [checkpointRow] };
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

test("strict RaidResolved decoder scopes both indexed roles and exposes no raw log fields", () => {
  const asAttacker = decodeRaidResolved(row, attacker);
  const asDefender = decodeRaidResolved(row, defender);
  assert.equal(asAttacker.role, "attacker");
  assert.equal(asAttacker.counterparty, defender);
  assert.equal(asDefender.role, "defender");
  assert.deepEqual(asAttacker.resources, {
    wood: "30",
    clay: "40",
    stone: "50",
    gold: "60",
  });
  assert.equal("topics" in asAttacker, false);
  assert.equal("data" in asAttacker, false);
  assert.equal(
    decodeRaidResolved(
      {
        ...row,
        topics: [`0x${"2".padStart(64, "0")}`, ...row.topics.slice(1)],
      },
      attacker,
    ),
    null,
  );
  assert.equal(decodeRaidResolved({ ...row, data: "0x00" }, attacker), null);
  for (const topicIndex of [1, 2]) {
    const nonCanonicalTopics = [...row.topics];
    nonCanonicalTopics[topicIndex] = `0x${"1".repeat(24)}${nonCanonicalTopics[
      topicIndex
    ].slice(-40)}`;
    assert.equal(
      decodeRaidResolved({ ...row, topics: nonCanonicalTopics }, attacker),
      null,
    );
  }
  assert.equal(
    decodeRaidResolved(row, "0x00000000000000000000000000000000000000cc"),
    null,
  );
});

test("history query accepts only technical pagination parameters", () => {
  assert.deepEqual(parseRaidHistoryQuery(new URLSearchParams("limit=50")), {
    cursor: null,
    limit: 50,
  });
  assert.throws(
    () => parseRaidHistoryQuery(new URLSearchParams("wallet=0x1")),
    /invalid_raid_history:query/,
  );
  assert.throws(
    () => parseRaidHistoryQuery(new URLSearchParams("limit=0")),
    /invalid_raid_history:limit/,
  );
  assert.throws(
    () => parseRaidHistoryQuery(new URLSearchParams("limit=1&limit=2")),
    /invalid_raid_history:query/,
  );
});

test("stored selected history corruption fails closed instead of hiding later events", async () => {
  const malformed = {
    ...historyRow(99, 0, 0, "3"),
    data: "0x00",
  };
  const history = poolFor({
    rows: [malformed, historyRow(98, 0, 0, "4")],
  });
  await assert.rejects(
    readPersonalRaidHistory(history.pool, {
      chainId: "480",
      contractAddress: contract,
      walletAddress: attacker,
      limit: 1,
    }),
    /raid_history_stored_history_corruption/,
  );
  assert.equal(
    history.calls.some(({ sql }) => sql === "COMMIT"),
    false,
  );
});

test("keyset pages are private, stable, and emit only decoded event fields", async () => {
  const first = poolFor({
    rows: [
      historyRow(99, 2, 1, "3"),
      historyRow(98, 1, 0, "4"),
      historyRow(97, 0, 2, "5"),
    ],
  });
  const firstPage = await readPersonalRaidHistory(first.pool, {
    chainId: "480",
    contractAddress: contract,
    walletAddress: attacker,
    limit: 2,
  });
  assert.equal(firstPage.events.length, 2);
  assert.ok(firstPage.nextCursor);
  assert.equal("topics" in firstPage.events[0], false);
  assert.equal("data" in firstPage.events[0], false);
  const firstEventsQuery = first.calls.find(({ sql }) =>
    sql.includes("SELECT e.block_number"),
  );
  assert.deepEqual(firstEventsQuery.parameters.slice(0, 4), [
    "480",
    contract,
    RAID_RESOLVED_SELECTOR,
    addressTopic(attacker).toLowerCase(),
  ]);

  const second = poolFor({ rows: [historyRow(97, 0, 2, "5")] });
  const secondPage = await readPersonalRaidHistory(second.pool, {
    chainId: "480",
    contractAddress: contract,
    walletAddress: attacker,
    cursor: firstPage.nextCursor,
    limit: 2,
  });
  assert.equal(secondPage.events[0].blockNumber, "97");
  const secondEventsQuery = second.calls.find(({ sql }) =>
    sql.includes("SELECT e.block_number"),
  );
  assert.deepEqual(secondEventsQuery.parameters.slice(4, 8), [
    "98",
    1,
    0,
    `0x${"4".repeat(64)}`,
  ]);

  const defenderOnly = poolFor({ rows: [historyRow(96, 0, 0, "8")] });
  const defenderPage = await readPersonalRaidHistory(defenderOnly.pool, {
    chainId: "480",
    contractAddress: contract,
    walletAddress: defender,
    limit: 1,
  });
  assert.equal(defenderPage.events[0].role, "defender");
  const defenderEventsQuery = defenderOnly.calls.find(({ sql }) =>
    sql.includes("SELECT e.block_number"),
  );
  assert.equal(
    defenderEventsQuery.parameters[3],
    addressTopic(defender).toLowerCase(),
  );
});

test("cursors fail closed across wallets or snapshots and when malformed", async () => {
  const initial = poolFor({
    rows: [historyRow(99, 0, 0, "6"), historyRow(98, 0, 0, "7")],
  });
  const page = await readPersonalRaidHistory(initial.pool, {
    chainId: "480",
    contractAddress: contract,
    walletAddress: attacker,
    limit: 1,
  });
  await assert.rejects(
    readPersonalRaidHistory(poolFor({ rows: [] }).pool, {
      chainId: "480",
      contractAddress: contract,
      walletAddress: defender,
      cursor: page.nextCursor,
    }),
    /invalid_raid_history:cursor/,
  );
  await assert.rejects(
    readPersonalRaidHistory(poolFor({ rows: [] }).pool, {
      chainId: "480",
      contractAddress: contract,
      walletAddress: attacker,
      cursor: "not-a-cursor",
    }),
    /invalid_raid_history:cursor/,
  );
  await assert.rejects(
    readPersonalRaidHistory(
      poolFor({
        rows: [],
        checkpointRow: { ...checkpoint, block_hash: `0x${"b".repeat(64)}` },
      }).pool,
      {
        chainId: "480",
        contractAddress: contract,
        walletAddress: attacker,
        cursor: page.nextCursor,
      },
    ),
    /raid_history_checkpoint_changed/,
  );
  const negativePosition = JSON.parse(
    Buffer.from(page.nextCursor, "base64url").toString("utf8"),
  );
  negativePosition.logIndex = -1;
  await assert.rejects(
    readPersonalRaidHistory(poolFor({ rows: [] }).pool, {
      chainId: "480",
      contractAddress: contract,
      walletAddress: attacker,
      cursor: Buffer.from(JSON.stringify(negativePosition)).toString(
        "base64url",
      ),
    }),
    /invalid_raid_history:cursor/,
  );
  await assert.rejects(
    readPersonalRaidHistory(
      poolFor({
        rows: [],
        checkpointRow: { ...checkpoint, block_hash: "not-a-block-hash" },
      }).pool,
      {
        chainId: "480",
        contractAddress: contract,
        walletAddress: attacker,
      },
    ),
    /raid_history_stored_history_corruption/,
  );
});
