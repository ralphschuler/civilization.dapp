import { fileURLToPath } from "node:url";
import { database } from "../src/lib/database.mjs";
import {
  normalizeReplayConfig,
  replayFinalizedBlocks,
} from "../server/chain-indexer-reader.js";

const requiredEnvironment = {
  rpcUrl: "CHAIN_INDEXER_RPC_URL",
  chainId: "CHAIN_INDEXER_CHAIN_ID",
  contractAddress: "CHAIN_INDEXER_PROXY_ADDRESS",
  startBlock: "CHAIN_INDEXER_START_BLOCK",
  confirmations: "CHAIN_INDEXER_CONFIRMATIONS",
  rollbackDepth: "CHAIN_INDEXER_ROLLBACK_DEPTH",
  maxBlockRange: "CHAIN_INDEXER_MAX_BLOCK_RANGE",
};

export function readReplayEnvironment(environment = process.env) {
  const config = {};
  for (const [key, variable] of Object.entries(requiredEnvironment)) {
    const value = environment[variable];
    if (typeof value !== "string" || value.trim() === "")
      throw new Error(`missing_chain_indexer_configuration:${variable}`);
    config[key] = value.trim();
  }
  let rpcUrl;
  try {
    rpcUrl = new URL(config.rpcUrl);
  } catch {
    throw new Error(
      "invalid_chain_indexer_configuration:CHAIN_INDEXER_RPC_URL",
    );
  }
  if (rpcUrl.protocol !== "http:" && rpcUrl.protocol !== "https:")
    throw new Error(
      "invalid_chain_indexer_configuration:CHAIN_INDEXER_RPC_URL",
    );
  return {
    ...normalizeReplayConfig(config),
    rpcUrl: rpcUrl.toString(),
  };
}

function rpcQuantity(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value))
    throw new Error("invalid_rpc_response");
  return value;
}

/** A minimal read-only EIP-1474 adapter; no signer or write RPC is exposed. */
export function createReadOnlyRpcAdapter(rpcUrl, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("invalid_rpc_adapter");
  let requestId = 0;
  async function request(method, params) {
    const id = ++requestId;
    const response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
    });
    if (!response.ok) throw new Error("rpc_request_failed");
    const payload = await response.json();
    if (
      !payload ||
      payload.jsonrpc !== "2.0" ||
      payload.id !== id ||
      Object.hasOwn(payload, "error") ||
      !("result" in payload)
    )
      throw new Error("rpc_request_failed");
    return payload.result;
  }
  return {
    async getChainId() {
      return rpcQuantity(await request("eth_chainId", []));
    },
    async getBlockNumber() {
      return rpcQuantity(await request("eth_blockNumber", []));
    },
    async getBlock(blockNumber) {
      return request("eth_getBlockByNumber", [
        `0x${BigInt(blockNumber).toString(16)}`,
        false,
      ]);
    },
    async getLogs({ address, fromBlock, toBlock }) {
      return request("eth_getLogs", [
        {
          address,
          fromBlock: `0x${BigInt(fromBlock).toString(16)}`,
          toBlock: `0x${BigInt(toBlock).toString(16)}`,
        },
      ]);
    },
  };
}

export async function loadCheckpoint(pool, config) {
  const result = await pool.query(
    `SELECT block_number AS "blockNumber", block_hash AS "blockHash"
       FROM chain_indexer_checkpoints
      WHERE chain_id = $1 AND contract_address = $2`,
    [config.chainId, config.contractAddress.toLowerCase()],
  );
  if (result.rowCount > 1) throw new Error("invalid_stored_checkpoint");
  return result.rowCount ? result.rows[0] : null;
}

export async function runChainIndexer({
  environment = process.env,
  pool,
  rpc,
  getCheckpoint = loadCheckpoint,
  replay = replayFinalizedBlocks,
} = {}) {
  const { rpcUrl, ...config } = readReplayEnvironment(environment);
  const activePool = pool ?? database();
  const adapter = rpc ?? createReadOnlyRpcAdapter(rpcUrl);
  const checkpoint = await getCheckpoint(activePool, config);
  return replay({ rpc: adapter, pool: activePool, config, checkpoint });
}

async function main() {
  let pool;
  try {
    // Validate every replay policy input before opening a database connection.
    readReplayEnvironment(process.env);
    pool = database();
    const result = await runChainIndexer({ pool });
    console.log(
      `Finalized chain-indexer replay completed (${result.batches} batch(es)).`,
    );
  } catch (error) {
    const code =
      error instanceof Error && /^[a-z0-9_:-]+$/.test(error.message)
        ? error.message
        : "chain_indexer_replay_failed";
    console.error(`Chain-indexer replay failed (${code}).`);
    process.exitCode = 1;
  } finally {
    if (pool)
      await pool.end().catch(() => {
        process.exitCode = 1;
      });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
