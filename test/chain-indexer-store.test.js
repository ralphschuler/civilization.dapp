import assert from "node:assert/strict";
import test from "node:test";
import { storeFinalizedEvents } from "../server/chain-indexer-store.js";

const hash = (value) => `0x${value.toString(16).padStart(64, "0")}`;
const address = "0x00000000000000000000000000000000000000aa";
const otherAddress = "0x00000000000000000000000000000000000000bb";

function block(
  number,
  blockHash = hash(number),
  parentHash = hash(number - 1),
) {
  return {
    blockNumber: number,
    blockHash,
    parentHash,
    timestamp: 1_700_000_000 + number,
  };
}

function event(overrides = {}) {
  return {
    blockNumber: 10,
    blockHash: hash(10),
    transactionHash: hash(1),
    transactionIndex: 0,
    logIndex: 0,
    address,
    topics: [hash(2)],
    data: "0x",
    ...overrides,
  };
}

function batch(overrides = {}) {
  const blocks = overrides.blocks ?? [block(10)];
  return {
    chainId: 1,
    contractAddress: address,
    blocks,
    logs: overrides.logs ?? [event()],
    checkpoint: overrides.checkpoint ?? blocks.at(-1),
    maxRollbackDepth: 4,
    ...overrides,
  };
}

function failingPool(calls) {
  return {
    async connect() {
      return {
        async query(sql) {
          calls.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
          if (
            sql === "BEGIN" ||
            sql === "ROLLBACK" ||
            sql.includes("pg_advisory_xact_lock")
          )
            return { rows: [], rowCount: 0 };
          if (sql.includes("FROM chain_indexer_checkpoints"))
            return { rows: [], rowCount: 0 };
          throw new Error("write_failed");
        },
        release() {
          calls.push("release");
        },
      };
    },
  };
}

test("store rejects malformed input before opening a transaction", async () => {
  let connected = false;
  await assert.rejects(
    storeFinalizedEvents(
      { connect: async () => ((connected = true), {}) },
      batch({ blocks: [{ ...block(10), timestamp: "nope" }] }),
    ),
    /invalid_chain_indexer_input:blocks.blockTimestamp/,
  );
  assert.equal(connected, false);
});

test("store rejects negative block timestamps before connecting", async () => {
  for (const timestamp of [-1, -1n, "1969-12-31T23:59:59.000Z", new Date(-1)]) {
    let connected = false;
    await assert.rejects(
      storeFinalizedEvents(
        { connect: async () => ((connected = true), {}) },
        batch({ blocks: [{ ...block(10), timestamp }] }),
      ),
      /invalid_chain_indexer_input:blocks.blockTimestamp/,
    );
    assert.equal(connected, false);
  }
});

test("store rejects logs outside the supplied contract or canonical blocks", async () => {
  const pool = { connect: async () => assert.fail("must not connect") };
  await assert.rejects(
    storeFinalizedEvents(
      pool,
      batch({ logs: [event({ address: otherAddress })] }),
    ),
    /invalid_chain_indexer_input:logs.contractAddress/,
  );
  await assert.rejects(
    storeFinalizedEvents(
      pool,
      batch({ logs: [event({ blockHash: hash(9) })] }),
    ),
    /log_not_in_supplied_blocks/,
  );
});

test("store rejects a checkpoint that is not the supplied canonical tip", async () => {
  const pool = { connect: async () => assert.fail("must not connect") };
  await assert.rejects(
    storeFinalizedEvents(pool, batch({ checkpoint: block(9) })),
    /checkpoint_not_batch_tip/,
  );
});

test("store preserves validated timestamps when replaying an append from a stored checkpoint", async () => {
  const ten = block(10);
  const eleven = block(11);
  const insertedBlocks = [];
  const pool = {
    async connect() {
      return {
        async query(sql, parameters) {
          if (
            sql === "BEGIN" ||
            sql === "COMMIT" ||
            sql === "ROLLBACK" ||
            sql.includes("pg_advisory_xact_lock") ||
            sql.includes("INSERT INTO chain_indexer_checkpoints")
          )
            return { rows: [], rowCount: 0 };
          if (sql.includes("FROM chain_indexer_checkpoints"))
            return {
              rows: [{ block_number: "10", block_hash: ten.blockHash }],
              rowCount: 1,
            };
          if (
            sql.includes("FROM chain_indexer_canonical_blocks") &&
            sql.includes("FOR UPDATE")
          )
            return {
              rows: [
                {
                  block_number: "10",
                  block_hash: ten.blockHash,
                  parent_hash: ten.parentHash,
                },
              ],
              rowCount: 1,
            };
          if (sql.includes("INSERT INTO chain_indexer_canonical_blocks")) {
            insertedBlocks.push(parameters);
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes("FROM chain_indexer_canonical_blocks"))
            return {
              rows: [
                {
                  block_number: "10",
                  block_hash: ten.blockHash,
                  parent_hash: ten.parentHash,
                  block_timestamp: new Date(ten.timestamp * 1000).toISOString(),
                },
                {
                  block_number: "11",
                  block_hash: eleven.blockHash,
                  parent_hash: eleven.parentHash,
                  block_timestamp: new Date(
                    eleven.timestamp * 1000,
                  ).toISOString(),
                },
              ],
              rowCount: 2,
            };
          if (sql.includes("FROM chain_indexer_raw_events"))
            return { rows: [], rowCount: 0 };
          assert.fail(`unexpected query: ${sql}`);
        },
        release() {},
      };
    },
  };

  await storeFinalizedEvents(pool, batch({ blocks: [ten, eleven], logs: [] }));

  assert.deepEqual(insertedBlocks, [
    [
      "1",
      address,
      "11",
      eleven.blockHash,
      eleven.parentHash,
      new Date(eleven.timestamp * 1000).toISOString(),
    ],
  ]);
});

test("store rolls its transaction back when a write or equality proof fails", async () => {
  const calls = [];
  await assert.rejects(
    storeFinalizedEvents(failingPool(calls), batch()),
    /write_failed/,
  );
  assert.deepEqual(calls, [
    "BEGIN",
    "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
    "SELECT block_number, block_hash",
    "INSERT INTO chain_indexer_canonical_blocks",
    "ROLLBACK",
    "release",
  ]);
});
