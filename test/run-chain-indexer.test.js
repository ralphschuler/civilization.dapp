import assert from "node:assert/strict";
import test from "node:test";
import {
  createReadOnlyRpcAdapter,
  readReplayEnvironment,
  runChainIndexer,
} from "../scripts/run-chain-indexer.mjs";

const environment = {
  CHAIN_INDEXER_RPC_URL: "https://rpc.example.invalid/path",
  CHAIN_INDEXER_CHAIN_ID: "1",
  CHAIN_INDEXER_PROXY_ADDRESS: "0x00000000000000000000000000000000000000aa",
  CHAIN_INDEXER_START_BLOCK: "10",
  CHAIN_INDEXER_CONFIRMATIONS: "2",
  CHAIN_INDEXER_ROLLBACK_DEPTH: "1",
  CHAIN_INDEXER_MAX_BLOCK_RANGE: "4",
};

test("CLI configuration has no implicit production defaults", () => {
  assert.throws(
    () =>
      readReplayEnvironment({ ...environment, CHAIN_INDEXER_START_BLOCK: "" }),
    /missing_chain_indexer_configuration:CHAIN_INDEXER_START_BLOCK/,
  );
  assert.throws(
    () =>
      readReplayEnvironment({
        ...environment,
        CHAIN_INDEXER_RPC_URL: "file:///tmp/rpc",
      }),
    /invalid_chain_indexer_configuration:CHAIN_INDEXER_RPC_URL/,
  );
  assert.equal(
    readReplayEnvironment(environment).rpcUrl,
    "https://rpc.example.invalid/path",
  );
});

test("CLI passes validated explicit config and stored checkpoint to injected reader", async () => {
  const pool = {
    query: async () => assert.fail("injected checkpoint loader expected"),
  };
  const checkpoint = {
    blockNumber: "12",
    blockHash: `0x${"12".padStart(64, "0")}`,
  };
  let received;
  const result = await runChainIndexer({
    environment,
    pool,
    rpc: { fake: true },
    getCheckpoint: async () => checkpoint,
    replay: async (input) => {
      received = input;
      return { batches: 1 };
    },
  });
  assert.deepEqual(result, { batches: 1 });
  assert.equal(received.pool, pool);
  assert.equal(received.checkpoint, checkpoint);
  assert.equal(received.config.startBlock, "10");
  assert.equal(
    received.config.contractAddress,
    environment.CHAIN_INDEXER_PROXY_ADDRESS,
  );
});

test("CLI rejects malformed replay configuration before loading a checkpoint", async () => {
  let checkpointLoaderCalled = false;
  await assert.rejects(
    runChainIndexer({
      environment: { ...environment, CHAIN_INDEXER_ROLLBACK_DEPTH: "3" },
      pool: {
        query: async () => assert.fail("checkpoint loader must not run"),
      },
      rpc: { fake: true },
      getCheckpoint: async () => {
        checkpointLoaderCalled = true;
        return null;
      },
      replay: async () => assert.fail("replay must not run"),
    }),
    /invalid_chain_indexer_reader:maxBlockRange/,
  );
  assert.equal(checkpointLoaderCalled, false);
});

test("read-only RPC adapter rejects stale or mismatched response IDs", async () => {
  for (const responseId of [0, 2, "1"]) {
    const rpc = createReadOnlyRpcAdapter(
      "https://rpc.example.invalid",
      async () => ({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: responseId,
          result: "0x1",
        }),
      }),
    );
    await assert.rejects(rpc.getChainId(), /rpc_request_failed/);
  }
});

test("read-only RPC adapter rejects every response with an error field", async () => {
  for (const error of [null, { code: -32000 }]) {
    const rpc = createReadOnlyRpcAdapter(
      "https://rpc.example.invalid",
      async () => ({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error,
          result: "0x1",
        }),
      }),
    );
    await assert.rejects(rpc.getChainId(), /rpc_request_failed/);
  }
});
