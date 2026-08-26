import {
  normalizeAndSortLogs,
  normalizeCanonicalBlock,
  normalizeChainId,
  normalizeContractAddress,
  normalizeNonnegativeQuantity,
} from "./chain-indexer-core.js";
import { storeFinalizedEvents } from "./chain-indexer-store.js";

function invalid(value) {
  throw new Error(`invalid_chain_indexer_reader:${value}`);
}

function positiveSafeInteger(value, field) {
  const normalized = normalizeNonnegativeQuantity(value, field);
  const parsed = BigInt(normalized);
  if (parsed === 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) invalid(field);
  return Number(parsed);
}

function blockHeight(value, field) {
  return normalizeNonnegativeQuantity(value, field);
}

function checkedRpc(rpc) {
  if (
    !rpc ||
    typeof rpc.getChainId !== "function" ||
    typeof rpc.getBlockNumber !== "function" ||
    typeof rpc.getBlock !== "function" ||
    typeof rpc.getLogs !== "function"
  )
    invalid("rpc");
  return rpc;
}

/** Validates the entirely explicit policy required for one manual replay. */
export function normalizeReplayConfig(config) {
  if (!config || typeof config !== "object") invalid("config");
  const chainId = normalizeChainId(config.chainId);
  const contractAddress = normalizeContractAddress(config.contractAddress);
  const startBlock = blockHeight(config.startBlock, "startBlock");
  const confirmations = blockHeight(config.confirmations, "confirmations");
  const rollbackDepth = blockHeight(config.rollbackDepth, "rollbackDepth");
  const maxBlockRange = positiveSafeInteger(
    config.maxBlockRange,
    "maxBlockRange",
  );
  // A later batch starts at checkpoint - rollbackDepth. It must therefore
  // begin strictly after the preceding range's start to make forward progress.
  if (BigInt(rollbackDepth) + 1n >= BigInt(maxBlockRange))
    invalid("maxBlockRange");
  return {
    chainId,
    contractAddress,
    startBlock,
    confirmations,
    rollbackDepth,
    maxBlockRange,
  };
}

function normalizeCheckpoint(checkpoint, config) {
  if (checkpoint === null || checkpoint === undefined) return null;
  if (!checkpoint || typeof checkpoint !== "object") invalid("checkpoint");
  // Database checkpoints deliberately contain only height and hash. A parent is
  // needed in freshly read blocks, but not to choose this replay's start.
  const normalized = normalizeCanonicalBlock(
    {
      ...checkpoint,
      parentHash: checkpoint.parentHash ?? checkpoint.blockHash,
    },
    "checkpoint",
  );
  if (BigInt(normalized.blockNumber) < BigInt(config.startBlock))
    invalid("checkpoint.blockNumber");
  return normalized;
}

function normalizeRpcBlock(block, expectedHeight) {
  if (!block || typeof block !== "object")
    throw new Error("incomplete_rpc_headers");
  let normalized;
  try {
    normalized = normalizeCanonicalBlock(
      {
        blockNumber: block.blockNumber ?? block.number,
        blockHash: block.blockHash ?? block.hash,
        parentHash: block.parentHash,
      },
      "rpcBlock",
    );
    normalized.blockTimestamp = blockHeight(
      block.blockTimestamp ?? block.timestamp,
      "rpcBlock.timestamp",
    );
  } catch {
    throw new Error("incomplete_rpc_headers");
  }
  if (normalized.blockNumber !== expectedHeight)
    throw new Error("incomplete_rpc_headers");
  return normalized;
}

async function readCompleteBatch(rpc, config, fromBlock, toBlock) {
  const heights = [];
  for (let height = BigInt(fromBlock); height <= BigInt(toBlock); height += 1n)
    heights.push(height.toString());
  let blocks;
  try {
    blocks = await Promise.all(
      heights.map(async (height) =>
        normalizeRpcBlock(await rpc.getBlock(height), height),
      ),
    );
  } catch {
    throw new Error("incomplete_rpc_headers");
  }
  for (let index = 1; index < blocks.length; index += 1) {
    if (blocks[index].parentHash !== blocks[index - 1].blockHash)
      throw new Error("noncanonical_rpc_headers");
  }
  let rawLogs;
  try {
    rawLogs = await rpc.getLogs({
      address: config.contractAddress,
      fromBlock,
      toBlock,
    });
  } catch {
    throw new Error("incomplete_rpc_logs");
  }
  if (!Array.isArray(rawLogs)) throw new Error("incomplete_rpc_logs");
  let logs;
  try {
    logs = normalizeAndSortLogs(config.chainId, rawLogs);
  } catch {
    throw new Error("incomplete_rpc_logs");
  }
  if (rawLogs.some((rawLog) => rawLog?.removed === true))
    throw new Error("incomplete_rpc_logs");
  const blocksByHeight = new Map(
    blocks.map((block) => [block.blockNumber, block]),
  );
  for (const log of logs) {
    if (
      log.contractAddress !== config.contractAddress ||
      BigInt(log.blockNumber) < BigInt(fromBlock) ||
      BigInt(log.blockNumber) > BigInt(toBlock) ||
      blocksByHeight.get(log.blockNumber)?.blockHash !== log.blockHash
    )
      throw new Error("incomplete_rpc_logs");
  }
  return { blocks, logs };
}

/**
 * Reads and stores finalized chain facts once. This deliberately has no poll
 * loop: every policy input and every resulting range is supplied by the caller.
 */
export async function replayFinalizedBlocks({
  rpc,
  pool,
  config,
  checkpoint = null,
  store = storeFinalizedEvents,
}) {
  const adapter = checkedRpc(rpc);
  if (!pool || typeof pool.connect !== "function") invalid("pool");
  if (typeof store !== "function") invalid("store");
  const normalizedConfig = normalizeReplayConfig(config);
  const rpcChainId = normalizeChainId(await adapter.getChainId());
  if (rpcChainId !== normalizedConfig.chainId)
    throw new Error("rpc_chain_id_mismatch");
  const head = blockHeight(await adapter.getBlockNumber(), "rpcHead");
  const finalizedTip = BigInt(head) - BigInt(normalizedConfig.confirmations);
  if (finalizedTip < BigInt(normalizedConfig.startBlock))
    return {
      ...normalizedConfig,
      head,
      finalizedTip: null,
      batches: 0,
      checkpoint: normalizeCheckpoint(checkpoint, normalizedConfig),
    };

  let currentCheckpoint = normalizeCheckpoint(checkpoint, normalizedConfig);
  const finalHeight = finalizedTip.toString();
  if (
    currentCheckpoint &&
    BigInt(currentCheckpoint.blockNumber) > BigInt(finalHeight)
  )
    throw new Error("checkpoint_ahead_of_finalized_tip");
  let nextFrom = currentCheckpoint
    ? BigInt(currentCheckpoint.blockNumber) -
        BigInt(normalizedConfig.rollbackDepth) <
      BigInt(normalizedConfig.startBlock)
      ? normalizedConfig.startBlock
      : (
          BigInt(currentCheckpoint.blockNumber) -
          BigInt(normalizedConfig.rollbackDepth)
        ).toString()
    : normalizedConfig.startBlock;
  let batches = 0;
  while (BigInt(nextFrom) <= finalizedTip) {
    const toBlock = (
      BigInt(nextFrom) + BigInt(normalizedConfig.maxBlockRange) - 1n >
      finalizedTip
        ? finalizedTip
        : BigInt(nextFrom) + BigInt(normalizedConfig.maxBlockRange) - 1n
    ).toString();
    const batch = await readCompleteBatch(
      adapter,
      normalizedConfig,
      nextFrom,
      toBlock,
    );
    const stored = await store(pool, {
      chainId: normalizedConfig.chainId,
      contractAddress: normalizedConfig.contractAddress,
      blocks: batch.blocks,
      // Logs have been validated in their canonical form above. The store is
      // intentionally the raw-RPC boundary and normalizes `address` itself.
      logs: batch.logs.map(({ contractAddress, ...log }) => ({
        ...log,
        address: contractAddress,
      })),
      checkpoint: batch.blocks.at(-1),
      maxRollbackDepth: normalizedConfig.rollbackDepth,
    });
    currentCheckpoint = normalizeCheckpoint(
      stored?.checkpoint,
      normalizedConfig,
    );
    if (!currentCheckpoint || currentCheckpoint.blockNumber !== toBlock)
      throw new Error("store_checkpoint_mismatch");
    batches += 1;
    if (BigInt(toBlock) === finalizedTip) break;
    nextFrom =
      BigInt(currentCheckpoint.blockNumber) -
        BigInt(normalizedConfig.rollbackDepth) <
      BigInt(normalizedConfig.startBlock)
        ? normalizedConfig.startBlock
        : (
            BigInt(currentCheckpoint.blockNumber) -
            BigInt(normalizedConfig.rollbackDepth)
          ).toString();
    // Equality is valid for a zero-depth overlap: the next range begins at
    // the preceding tip and still extends it by maxBlockRange - 1 blocks.
    if (BigInt(nextFrom) > BigInt(toBlock))
      throw new Error("replay_range_not_advancing");
  }
  return {
    ...normalizedConfig,
    head,
    finalizedTip: finalHeight,
    batches,
    checkpoint: currentCheckpoint,
  };
}
