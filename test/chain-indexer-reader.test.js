import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeReplayConfig,
  replayFinalizedBlocks,
} from "../server/chain-indexer-reader.js";

const address = "0x00000000000000000000000000000000000000aa";
const hash = (value) => `0x${value.toString(16).padStart(64, "0")}`;

function block(number, overrides = {}) {
  return {
    number: `0x${number.toString(16)}`,
    hash: hash(number),
    parentHash: hash(number - 1),
    timestamp: `0x${(1_700_000_000 + number).toString(16)}`,
    ...overrides,
  };
}

function log(number, overrides = {}) {
  return {
    blockNumber: `0x${number.toString(16)}`,
    blockHash: hash(number),
    transactionHash: hash(1_000 + number),
    transactionIndex: "0x0",
    logIndex: "0x0",
    address,
    topics: [hash(10)],
    data: "0x",
    ...overrides,
  };
}

function fakeRpc({ head = 14, blocks = {}, logs = [] } = {}) {
  const calls = { blocks: [], logs: [] };
  return {
    calls,
    async getChainId() {
      return "0x1";
    },
    async getBlockNumber() {
      return `0x${head.toString(16)}`;
    },
    async getBlock(height) {
      calls.blocks.push(height);
      return blocks[height] === undefined
        ? block(Number(height))
        : blocks[height];
    },
    async getLogs(range) {
      calls.logs.push(range);
      return logs.filter((item) => {
        const height = BigInt(item.blockNumber);
        return (
          height >= BigInt(range.fromBlock) && height <= BigInt(range.toBlock)
        );
      });
    },
  };
}

const config = {
  chainId: "1",
  contractAddress: address,
  startBlock: "10",
  confirmations: "2",
  rollbackDepth: "1",
  maxBlockRange: "4",
};

test("reader replays only complete finalized proxy-filtered batches with bounded overlap", async () => {
  const rpc = fakeRpc({ head: 16, logs: [log(10), log(11), log(11), log(14)] });
  const batches = [];
  const result = await replayFinalizedBlocks({
    rpc,
    pool: { connect() {} },
    config,
    store: async (_pool, batch) => {
      batches.push(batch);
      return { checkpoint: batch.checkpoint };
    },
  });
  assert.deepEqual(
    batches.map((batch) => [
      batch.blocks[0].blockNumber,
      batch.checkpoint.blockNumber,
    ]),
    [
      ["10", "13"],
      ["12", "14"],
    ],
  );
  assert.equal(
    batches[0].logs.length,
    2,
    "identical RPC duplicates are normalized",
  );
  assert.deepEqual(
    batches[0].logs.map(({ address: logAddress, contractAddress }) => [
      logAddress,
      contractAddress,
    ]),
    [
      [address, undefined],
      [address, undefined],
    ],
    "reader adapts canonical logs to the store's RPC-shaped input boundary",
  );
  assert.deepEqual(
    rpc.calls.logs.map(({ fromBlock, toBlock, address: requestedAddress }) => [
      fromBlock,
      toBlock,
      requestedAddress,
    ]),
    [
      ["10", "13", address],
      ["12", "14", address],
    ],
  );
  assert.equal(result.finalizedTip, "14");
  assert.equal(result.batches, 2);
});

test("reader starts from the bounded reorg tail of an existing checkpoint", async () => {
  const rpc = fakeRpc({ head: 16 });
  const batches = [];
  await replayFinalizedBlocks({
    rpc,
    pool: { connect() {} },
    config: { ...config, rollbackDepth: "2", maxBlockRange: "5" },
    checkpoint: { blockNumber: "13", blockHash: hash(13) },
    store: async (_pool, batch) => {
      batches.push(batch);
      return { checkpoint: batch.checkpoint };
    },
  });
  assert.deepEqual(
    batches.map((batch) => batch.blocks.map((entry) => entry.blockNumber)),
    [["11", "12", "13", "14"]],
  );
});

test("reader does nothing when the explicit confirmation window has no finalized block", async () => {
  const rpc = fakeRpc({ head: 11 });
  let stored = false;
  const result = await replayFinalizedBlocks({
    rpc,
    pool: { connect() {} },
    config,
    store: async () => {
      stored = true;
    },
  });
  assert.equal(stored, false);
  assert.equal(result.finalizedTip, null);
});

test("reader fails closed on mismatched chain, missing headers, and invalid logs", async () => {
  await assert.rejects(
    replayFinalizedBlocks({
      rpc: { ...fakeRpc(), getChainId: async () => "0x2" },
      pool: { connect() {} },
      config,
      store: async () => {},
    }),
    /rpc_chain_id_mismatch/,
  );
  await assert.rejects(
    replayFinalizedBlocks({
      rpc: fakeRpc({ blocks: { 10: null } }),
      pool: { connect() {} },
      config,
      store: async () => {},
    }),
    /incomplete_rpc_headers/,
  );
  await assert.rejects(
    replayFinalizedBlocks({
      rpc: fakeRpc({
        logs: [
          log(10, { address: "0x00000000000000000000000000000000000000bb" }),
        ],
      }),
      pool: { connect() {} },
      config,
      store: async () => {},
    }),
    /incomplete_rpc_logs/,
  );
  await assert.rejects(
    replayFinalizedBlocks({
      rpc: fakeRpc({ logs: [log(10, { removed: true })] }),
      pool: { connect() {} },
      config,
      store: async () => {},
    }),
    /incomplete_rpc_logs/,
  );
  await assert.rejects(
    replayFinalizedBlocks({
      rpc: fakeRpc(),
      pool: { connect() {} },
      config,
      checkpoint: { blockNumber: "15", blockHash: hash(15) },
      store: async () => {},
    }),
    /checkpoint_ahead_of_finalized_tip/,
  );
});

test("reader refuses unsafe or non-advancing range configuration", () => {
  assert.throws(
    () => normalizeReplayConfig({ ...config, maxBlockRange: "1" }),
    /maxBlockRange/,
  );
  assert.throws(
    () =>
      normalizeReplayConfig({
        ...config,
        maxBlockRange: "4",
        rollbackDepth: "3",
      }),
    /maxBlockRange/,
  );
  assert.throws(
    () => normalizeReplayConfig({ ...config, startBlock: "-1" }),
    /startBlock/,
  );
});
