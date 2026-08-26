import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import pg from "pg";
import { replayFinalizedBlocks } from "../server/chain-indexer-reader.js";
import { storeFinalizedEvents } from "../server/chain-indexer-store.js";
import { loadMigrations, runMigrations } from "../scripts/lib/migrations.mjs";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = { skip: !databaseUrl };
const address = "0x00000000000000000000000000000000000000aa";
const otherAddress = "0x00000000000000000000000000000000000000bb";
const hash = (value) => `0x${value.toString(16).padStart(64, "0")}`;

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

function event(number, overrides = {}) {
  return {
    blockNumber: number,
    blockHash: hash(number),
    transactionHash: hash(number + 1_000),
    transactionIndex: 0,
    logIndex: 0,
    address,
    topics: [hash(2)],
    data: "0x",
    ...overrides,
  };
}

function batch(blocks, logs, overrides = {}) {
  return {
    chainId: 1,
    contractAddress: address,
    blocks,
    logs,
    checkpoint: blocks.at(-1),
    maxRollbackDepth: 4,
    ...overrides,
  };
}

async function inOwnedSchema(run) {
  const schema = `indexer_store_${crypto.randomBytes(10).toString("hex")}`;
  const admin = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 4,
    options: `-c search_path=${schema}`,
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    const migration = (await loadMigrations("migrations")).find(
      ({ version }) => version === "008",
    );
    await runMigrations(pool, [migration]);
    return await run(pool);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}

async function state(pool, chainId = "1", contractAddress = address) {
  const [checkpoint, blocks, events] = await Promise.all([
    pool.query(
      "SELECT block_number, block_hash FROM chain_indexer_checkpoints WHERE chain_id = $1 AND contract_address = $2",
      [chainId, contractAddress],
    ),
    pool.query(
      "SELECT block_number, block_hash FROM chain_indexer_canonical_blocks WHERE chain_id = $1 AND contract_address = $2 ORDER BY block_number",
      [chainId, contractAddress],
    ),
    pool.query(
      "SELECT block_number, block_hash, data FROM chain_indexer_raw_events WHERE chain_id = $1 AND contract_address = $2 ORDER BY block_number",
      [chainId, contractAddress],
    ),
  ]);
  return {
    checkpoint: checkpoint.rows,
    blocks: blocks.rows,
    events: events.rows,
  };
}

test(
  "PostgreSQL store persists, replays exactly, isolates scopes, rejects conflicts, appends, reorgs, and rolls back",
  integration,
  async () => {
    await inOwnedSchema(async (pool) => {
      const ten = block(10);
      const first = batch([ten], [event(10)]);
      await storeFinalizedEvents(pool, first);
      const initial = await state(pool);
      await storeFinalizedEvents(pool, first);
      assert.deepEqual(
        await state(pool),
        initial,
        "exact replay is idempotent",
      );

      const eleven = block(11);
      const appended = batch([ten, eleven], [event(10), event(11)]);
      await storeFinalizedEvents(pool, appended);
      assert.deepEqual(
        (await state(pool)).blocks.map((row) => String(row.block_number)),
        ["10", "11"],
      );

      const beforeConflict = await state(pool);
      await assert.rejects(
        storeFinalizedEvents(
          pool,
          batch([ten, eleven], [event(10, { data: "0x01" }), event(11)]),
        ),
        /stored_event_mismatch/,
      );
      assert.deepEqual(
        await state(pool),
        beforeConflict,
        "conflict leaves state unchanged",
      );

      const twelve = block(12);
      await storeFinalizedEvents(
        pool,
        batch([ten, eleven, twelve], [event(10), event(11), event(12)]),
      );
      const replacementEleven = block(11, hash(211), ten.blockHash);
      const replacementTwelve = block(
        12,
        hash(212),
        replacementEleven.blockHash,
      );
      await storeFinalizedEvents(
        pool,
        batch(
          [ten, replacementEleven, replacementTwelve],
          [
            event(10),
            event(11, { blockHash: replacementEleven.blockHash }),
            event(12, { blockHash: replacementTwelve.blockHash }),
          ],
        ),
      );
      assert.deepEqual(
        (await state(pool)).blocks.map((row) => row.block_hash),
        [
          ten.blockHash,
          replacementEleven.blockHash,
          replacementTwelve.blockHash,
        ],
      );

      const beforeStale = await state(pool);
      await assert.rejects(
        storeFinalizedEvents(
          pool,
          batch(
            [ten, replacementEleven],
            [event(10), event(11, { blockHash: replacementEleven.blockHash })],
          ),
        ),
        /stale_checkpoint/,
      );
      assert.deepEqual(
        await state(pool),
        beforeStale,
        "stale input cannot delete a reorg tail or regress the checkpoint",
      );

      const beforeFailedReorg = await state(pool);
      const failingPool = {
        async connect() {
          const client = await pool.connect();
          return {
            query(sql, parameters) {
              if (
                sql.includes("INSERT INTO chain_indexer_canonical_blocks") &&
                parameters?.[2] === "11"
              )
                throw new Error("forced_write_failure");
              return client.query(sql, parameters);
            },
            release() {
              client.release();
            },
          };
        },
      };
      const anotherEleven = block(11, hash(311), ten.blockHash);
      const anotherTwelve = block(12, hash(312), anotherEleven.blockHash);
      await assert.rejects(
        storeFinalizedEvents(
          failingPool,
          batch(
            [ten, anotherEleven, anotherTwelve],
            [
              event(10),
              event(11, { blockHash: anotherEleven.blockHash }),
              event(12, { blockHash: anotherTwelve.blockHash }),
            ],
          ),
        ),
        /forced_write_failure/,
      );
      assert.deepEqual(
        await state(pool),
        beforeFailedReorg,
        "failure after tail deletion rolls back",
      );

      await storeFinalizedEvents(
        pool,
        batch([block(20)], [event(20, { address: otherAddress })], {
          chainId: 2,
          contractAddress: otherAddress,
        }),
      );
      assert.equal(
        (await state(pool, "2", otherAddress)).checkpoint[0].block_number,
        "20",
        "scope is isolated",
      );
    });
  },
);

test(
  "reader and migration-008 store deterministically replay a backfill and replacement chain",
  integration,
  async () => {
    await inOwnedSchema(async (pool) => {
      const config = {
        chainId: "1",
        contractAddress: address,
        startBlock: "10",
        confirmations: "1",
        rollbackDepth: "2",
        maxBlockRange: "4",
      };
      const initialBlocks = new Map(
        [10, 11, 12].map((number) => [String(number), block(number)]),
      );
      const makeRpc = (blocks) => ({
        async getChainId() {
          return "0x1";
        },
        async getBlockNumber() {
          return "0xd";
        },
        async getBlock(number) {
          return blocks.get(String(number)) ?? null;
        },
        async getLogs({ fromBlock, toBlock }) {
          return [...blocks.values()]
            .filter(
              (entry) =>
                BigInt(entry.blockNumber) >= BigInt(fromBlock) &&
                BigInt(entry.blockNumber) <= BigInt(toBlock),
            )
            .map((entry) =>
              event(Number(entry.blockNumber), { blockHash: entry.blockHash }),
            );
        },
      });
      await replayFinalizedBlocks({
        rpc: makeRpc(initialBlocks),
        pool,
        config,
      });
      const initial = await state(pool);
      await replayFinalizedBlocks({
        rpc: makeRpc(initialBlocks),
        pool,
        config,
        checkpoint: { blockNumber: "12", blockHash: hash(12) },
      });
      assert.deepEqual(
        await state(pool),
        initial,
        "identical reader replay is idempotent",
      );

      const replacementEleven = block(11, hash(211), hash(10));
      const replacementTwelve = block(
        12,
        hash(212),
        replacementEleven.blockHash,
      );
      const replacement = new Map([
        ["10", block(10)],
        ["11", replacementEleven],
        ["12", replacementTwelve],
      ]);
      await replayFinalizedBlocks({
        rpc: makeRpc(replacement),
        pool,
        config,
        checkpoint: { blockNumber: "12", blockHash: hash(12) },
      });
      const final = await state(pool);
      assert.deepEqual(
        final.blocks.map((row) => row.block_hash),
        [hash(10), hash(211), hash(212)],
      );
      assert.deepEqual(
        final.events.map((row) => row.block_hash),
        [hash(10), hash(211), hash(212)],
      );
    });
  },
);

test(
  "PostgreSQL advisory locks serialize compatible first writers and reject incompatible ones",
  integration,
  async () => {
    await inOwnedSchema(async (pool) => {
      async function race(firstBatch, secondBatch) {
        let releaseFirst;
        const allowFirst = new Promise((resolve) => {
          releaseFirst = resolve;
        });
        let firstLocked;
        const locked = new Promise((resolve) => {
          firstLocked = resolve;
        });
        const holdingPool = {
          async connect() {
            const client = await pool.connect();
            return {
              async query(sql, parameters) {
                const result = await client.query(sql, parameters);
                if (sql.includes("pg_advisory_xact_lock")) {
                  firstLocked();
                  await allowFirst;
                }
                return result;
              },
              release() {
                client.release();
              },
            };
          },
        };
        const first = storeFinalizedEvents(holdingPool, firstBatch);
        await locked;
        let secondSettled = false;
        const second = storeFinalizedEvents(pool, secondBatch).finally(() => {
          secondSettled = true;
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(
          secondSettled,
          false,
          "same normalized scope waits for the first writer",
        );
        releaseFirst();
        await first;
        return second;
      }

      const compatible = batch([block(10)], [event(10)]);
      await race(compatible, compatible);
      assert.equal((await state(pool)).checkpoint[0].block_number, "10");

      const firstInSecondScope = batch([block(20)], [event(20)], {
        chainId: 2,
      });
      const divergentFirstWriter = batch(
        [block(20, hash(920))],
        [event(20, { blockHash: hash(920) })],
        { chainId: 2 },
      );
      await assert.rejects(
        race(firstInSecondScope, divergentFirstWriter),
        /reorg_common_ancestor_not_found/,
      );
    });
  },
);
