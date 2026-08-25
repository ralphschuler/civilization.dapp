import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalEventIdentity,
  finalizedLogs,
  normalizeAndSortLogs,
  planReorgRollback,
} from "../server/chain-indexer-core.js";

const hash = (value) => `0x${value.toString(16).padStart(64, "0")}`;
const address = "0x00000000000000000000000000000000000000aa";
const log = (overrides = {}) => ({
  blockNumber: "0x64",
  blockHash: hash(100),
  transactionHash: hash(1),
  transactionIndex: "0x0",
  logIndex: "0x0",
  address,
  topics: [hash(10)],
  data: "0x",
  ...overrides,
});
const block = (number, blockHash, parentHash) => ({
  blockNumber: number,
  blockHash,
  parentHash,
});

test("indexer core deduplicates identical logs using the canonical event identity", () => {
  const duplicate = log({ transactionHash: hash(2), logIndex: "0x3" });
  const events = normalizeAndSortLogs("0x1", [duplicate, duplicate]);
  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, `1:${address}:${hash(2)}:3`);
  assert.equal(
    canonicalEventIdentity({
      chainId: 1,
      contractAddress: address.toUpperCase().replace("0X", "0x"),
      transactionHash: hash(2).toUpperCase().replace("0X", "0x"),
      logIndex: "0x3",
    }),
    `1:${address}:${hash(2)}:3`,
  );
});

test("indexer core scopes canonical event identities to the normalized contract", () => {
  const alternateAddress = "0x00000000000000000000000000000000000000bb";
  const events = normalizeAndSortLogs("1", [
    log(),
    log({ address: alternateAddress.toUpperCase().replace("0X", "0x") }),
  ]);
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map(({ eventId }) => eventId),
    [`1:${address}:${hash(1)}:0`, `1:${alternateAddress}:${hash(1)}:0`],
  );
});

test("indexer core produces deterministic canonical log order", () => {
  const events = normalizeAndSortLogs("1", [
    log({ transactionHash: hash(3), transactionIndex: "0x1", logIndex: "0x1" }),
    log({ transactionHash: hash(2), transactionIndex: "0x0", logIndex: "0x2" }),
    log({ transactionHash: hash(1), transactionIndex: "0x0", logIndex: "0x1" }),
    log({ blockNumber: "0x63", blockHash: hash(99), logIndex: "0x9" }),
  ]);
  assert.deepEqual(
    events.map(({ blockNumber, transactionIndex, logIndex }) => [
      blockNumber,
      transactionIndex,
      logIndex,
    ]),
    [
      ["99", "0", "9"],
      ["100", "0", "1"],
      ["100", "0", "2"],
      ["100", "1", "1"],
    ],
  );
});

test("indexer core excludes logs above the supplied finalized height", () => {
  const events = finalizedLogs(
    "1",
    [
      log(),
      log({
        blockNumber: "101",
        blockHash: hash(101),
        transactionHash: hash(2),
      }),
    ],
    100,
  );
  assert.deepEqual(
    events.map(({ blockNumber }) => blockNumber),
    ["100"],
  );
});

test("indexer core plans a same-height reorg rollback and replay", () => {
  const plan = planReorgRollback({
    checkpoint: block(100, hash(100), hash(99)),
    canonicalBlocks: [
      block(99, hash(99), hash(98)),
      block(100, hash(100), hash(99)),
    ],
    observedBlocks: [block(100, hash(200), hash(99))],
    maxRollbackDepth: 4,
  });
  assert.deepEqual(plan, {
    commonAncestor: block("99", hash(99), hash(98)),
    rollbackDepth: "1",
    deleteFromBlockNumber: "100",
    replayFromBlockNumber: "100",
    replayBlocks: [block("100", hash(200), hash(99))],
  });
});

test("indexer core fails closed for a replay gap after its common ancestor", () => {
  assert.throws(
    () =>
      planReorgRollback({
        checkpoint: block(100, hash(100), hash(99)),
        canonicalBlocks: [
          block(99, hash(99), hash(98)),
          block(100, hash(100), hash(99)),
        ],
        observedBlocks: [
          block(99, hash(99), hash(98)),
          block(101, hash(201), hash(99)),
        ],
        maxRollbackDepth: 4,
      }),
    /noncontiguous_observed_replay_blocks/,
  );
});

test("indexer core fails closed when a reorg exceeds its explicit rollback bound", () => {
  assert.throws(
    () =>
      planReorgRollback({
        checkpoint: block(105, hash(105), hash(104)),
        canonicalBlocks: [
          block(99, hash(99), hash(98)),
          block(105, hash(105), hash(104)),
        ],
        observedBlocks: [block(100, hash(200), hash(99))],
        maxRollbackDepth: 4,
      }),
    /reorg_depth_exceeded/,
  );
});
