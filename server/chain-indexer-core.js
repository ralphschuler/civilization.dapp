function invalid(value) {
  throw new Error(`invalid_chain_indexer_input:${value}`);
}

function quantity(value, field) {
  let parsed;
  try {
    if (typeof value === "bigint") parsed = value;
    else if (typeof value === "number" && Number.isSafeInteger(value))
      parsed = BigInt(value);
    else if (
      typeof value === "string" &&
      /^(?:0|[1-9][0-9]*|0x[0-9a-fA-F]+)$/.test(value)
    )
      parsed = BigInt(value);
    else invalid(field);
  } catch {
    invalid(field);
  }
  if (parsed < 0n) invalid(field);
  return parsed;
}

function decimalQuantity(value, field) {
  return quantity(value, field).toString();
}

function databaseQuantity(value, field, maximum) {
  const parsed = quantity(value, field);
  if (parsed > maximum) invalid(field);
  return parsed.toString();
}

function databaseBigint(value, field) {
  return databaseQuantity(value, field, 9_223_372_036_854_775_807n);
}

function databaseInteger(value, field) {
  return databaseQuantity(value, field, 2_147_483_647n);
}

function hash(value, field) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value))
    invalid(field);
  return value.toLowerCase();
}

function address(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value))
    invalid("address");
  return value.toLowerCase();
}

function hexData(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value))
    invalid("data");
  return value.toLowerCase();
}

function compareQuantities(left, right) {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Produces the stable database key for one EVM log. */
export function canonicalEventIdentity({
  chainId,
  contractAddress,
  transactionHash,
  logIndex,
}) {
  return `${decimalQuantity(chainId, "chainId")}:${address(contractAddress)}:${hash(
    transactionHash,
    "transactionHash",
  )}:${decimalQuantity(logIndex, "logIndex")}`;
}

/** Normalizes an RPC-shaped log into database-ready, JSON-safe primitives. */
export function normalizeLog(chainId, log) {
  if (!log || typeof log !== "object") invalid("log");
  const normalized = {
    chainId: decimalQuantity(chainId, "chainId"),
    blockNumber: databaseBigint(log.blockNumber, "blockNumber"),
    blockHash: hash(log.blockHash, "blockHash"),
    transactionHash: hash(log.transactionHash, "transactionHash"),
    transactionIndex: databaseInteger(log.transactionIndex, "transactionIndex"),
    logIndex: databaseInteger(log.logIndex, "logIndex"),
    contractAddress: address(log.address),
    topics: Array.isArray(log.topics)
      ? log.topics.map((topic) => hash(topic, "topic"))
      : invalid("topics"),
    data: hexData(log.data),
  };
  return { ...normalized, eventId: canonicalEventIdentity(normalized) };
}

/** Sorts logs in canonical execution order and rejects conflicting duplicates. */
export function normalizeAndSortLogs(chainId, logs) {
  if (!Array.isArray(logs)) invalid("logs");
  const normalized = logs.map((log) => normalizeLog(chainId, log));
  normalized.sort(
    (left, right) =>
      compareQuantities(left.blockNumber, right.blockNumber) ||
      compareQuantities(left.transactionIndex, right.transactionIndex) ||
      compareQuantities(left.logIndex, right.logIndex) ||
      left.transactionHash.localeCompare(right.transactionHash),
  );
  const unique = [];
  const seen = new Map();
  for (const log of normalized) {
    const previous = seen.get(log.eventId);
    if (!previous) {
      seen.set(log.eventId, log);
      unique.push(log);
    } else if (JSON.stringify(previous) !== JSON.stringify(log))
      throw new Error("conflicting_duplicate_event");
  }
  return unique;
}

/** Keeps only events at or below an explicitly supplied finalized height. */
export function finalizedLogs(chainId, logs, finalizedBlockNumber) {
  const finalized = decimalQuantity(
    finalizedBlockNumber,
    "finalizedBlockNumber",
  );
  return normalizeAndSortLogs(chainId, logs).filter(
    (log) => compareQuantities(log.blockNumber, finalized) <= 0,
  );
}

function normalizeBlock(block, field) {
  if (!block || typeof block !== "object") invalid(field);
  return {
    blockNumber: databaseBigint(block.blockNumber, `${field}.blockNumber`),
    blockHash: hash(block.blockHash, `${field}.blockHash`),
    parentHash: hash(block.parentHash, `${field}.parentHash`),
  };
}

function sortedBlocks(blocks, field) {
  if (!Array.isArray(blocks)) invalid(field);
  const normalized = blocks.map((block) => normalizeBlock(block, field));
  normalized.sort((left, right) =>
    compareQuantities(left.blockNumber, right.blockNumber),
  );
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (current.blockNumber === previous.blockNumber)
      throw new Error("duplicate_block_height");
    if (
      BigInt(current.blockNumber) === BigInt(previous.blockNumber) + 1n &&
      current.parentHash !== previous.blockHash
    )
      throw new Error("noncanonical_observed_blocks");
  }
  return normalized;
}

/**
 * Finds a verified common ancestor and returns a deletion/replay plan only.
 * The caller owns all database mutations and must provide an explicit depth.
 */
export function planReorgRollback({
  checkpoint,
  canonicalBlocks,
  observedBlocks,
  maxRollbackDepth,
}) {
  const current = normalizeBlock(checkpoint, "checkpoint");
  const stored = sortedBlocks(canonicalBlocks, "canonicalBlocks");
  const observed = sortedBlocks(observedBlocks, "observedBlocks");
  const maxDepth = quantity(maxRollbackDepth, "maxRollbackDepth");
  const storedByHeight = new Map(
    stored.map((block) => [block.blockNumber, block]),
  );
  if (storedByHeight.get(current.blockNumber)?.blockHash !== current.blockHash)
    throw new Error("checkpoint_not_in_canonical_blocks");

  const ancestors = [];
  for (const block of observed) {
    if (storedByHeight.get(block.blockNumber)?.blockHash === block.blockHash)
      ancestors.push(block);
    const parentHeight = (BigInt(block.blockNumber) - 1n).toString();
    const parent = storedByHeight.get(parentHeight);
    if (parent?.blockHash === block.parentHash) ancestors.push(parent);
  }
  const ancestor = ancestors.sort((left, right) =>
    compareQuantities(right.blockNumber, left.blockNumber),
  )[0];
  if (!ancestor) throw new Error("reorg_common_ancestor_not_found");
  if (BigInt(ancestor.blockNumber) > BigInt(current.blockNumber))
    throw new Error("observed_chain_ahead_of_checkpoint");

  const rollbackDepth =
    BigInt(current.blockNumber) - BigInt(ancestor.blockNumber);
  if (rollbackDepth > maxDepth) throw new Error("reorg_depth_exceeded");
  const replayFromBlockNumber = (BigInt(ancestor.blockNumber) + 1n).toString();
  const replayBlocks = observed.filter(
    (block) => BigInt(block.blockNumber) > BigInt(ancestor.blockNumber),
  );
  let previous = ancestor;
  for (const block of replayBlocks) {
    if (BigInt(block.blockNumber) !== BigInt(previous.blockNumber) + 1n)
      throw new Error("noncontiguous_observed_replay_blocks");
    if (block.parentHash !== previous.blockHash)
      throw new Error("noncanonical_observed_blocks");
    previous = block;
  }
  return {
    commonAncestor: ancestor,
    rollbackDepth: rollbackDepth.toString(),
    deleteFromBlockNumber: rollbackDepth === 0n ? null : replayFromBlockNumber,
    replayFromBlockNumber,
    replayBlocks,
  };
}
