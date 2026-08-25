import {
  normalizeAndSortLogs,
  normalizeCanonicalBlock,
  normalizeChainId,
  normalizeContractAddress,
  normalizeNonnegativeQuantity,
  planReorgRollback,
} from "./chain-indexer-core.js";

function invalid(value) {
  throw new Error(`invalid_chain_indexer_input:${value}`);
}

function compareHeight(left, right) {
  const a = BigInt(left);
  const b = BigInt(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

function blockIdentity(block) {
  return `${block.blockNumber}:${block.blockHash}`;
}

function normalizeTimestamp(value, field) {
  let date;
  if (value instanceof Date) date = value;
  else if (typeof value === "string" && value.includes("T"))
    date = new Date(value);
  else if (
    typeof value === "bigint" ||
    (typeof value === "number" && Number.isSafeInteger(value)) ||
    (typeof value === "string" &&
      /^(?:0|[1-9][0-9]*|0x[0-9a-fA-F]+)$/.test(value))
  ) {
    try {
      const seconds = BigInt(value);
      if (seconds < 0n) invalid(field);
      date = new Date(Number(seconds * 1000n));
    } catch {
      invalid(field);
    }
  } else invalid(field);
  if (Number.isNaN(date.getTime()) || date.getTime() < 0) invalid(field);
  return date.toISOString();
}

function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) invalid("blocks");
  const normalized = blocks
    .map((block) => ({
      ...normalizeCanonicalBlock(block, "blocks"),
      blockTimestamp: normalizeTimestamp(
        block?.blockTimestamp ?? block?.timestamp,
        "blocks.blockTimestamp",
      ),
    }))
    .sort((left, right) => compareHeight(left.blockNumber, right.blockNumber));
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (current.blockNumber === previous.blockNumber)
      throw new Error("duplicate_block_height");
    if (BigInt(current.blockNumber) !== BigInt(previous.blockNumber) + 1n)
      throw new Error("noncontiguous_observed_blocks");
    if (current.parentHash !== previous.blockHash)
      throw new Error("noncanonical_observed_blocks");
  }
  return normalized;
}

function normalizeCheckpoint(checkpoint, chainId, contractAddress) {
  const normalized = normalizeCanonicalBlock(checkpoint, "checkpoint");
  if (
    checkpoint?.chainId !== undefined &&
    normalizeChainId(checkpoint.chainId) !== chainId
  )
    invalid("checkpoint.chainId");
  if (
    checkpoint?.contractAddress !== undefined &&
    normalizeContractAddress(checkpoint.contractAddress) !== contractAddress
  )
    invalid("checkpoint.contractAddress");
  return normalized;
}

function assertSameBlocks(actual, expected) {
  if (actual.length !== expected.length)
    throw new Error("stored_block_mismatch");
  for (let index = 0; index < expected.length; index += 1) {
    const stored = actual[index];
    const observed = expected[index];
    if (
      String(stored.block_number) !== observed.blockNumber ||
      String(stored.block_hash).toLowerCase() !== observed.blockHash ||
      String(stored.parent_hash).toLowerCase() !== observed.parentHash ||
      normalizeTimestamp(stored.block_timestamp, "stored.blockTimestamp") !==
        observed.blockTimestamp
    )
      throw new Error("stored_block_mismatch");
  }
}

function normalizeStoredLog(chainId, row) {
  return normalizeAndSortLogs(chainId, [
    {
      blockNumber: row.block_number,
      blockHash: row.block_hash,
      transactionHash: row.transaction_hash,
      transactionIndex: row.transaction_index,
      logIndex: row.log_index,
      address: row.contract_address,
      topics:
        typeof row.topics === "string" ? JSON.parse(row.topics) : row.topics,
      data: row.data,
    },
  ])[0];
}

function assertSameLogs(chainId, actual, expected) {
  const normalizedActual = actual
    .map((row) => normalizeStoredLog(chainId, row))
    .sort((left, right) => left.eventId.localeCompare(right.eventId));
  const normalizedExpected = [...expected].sort((left, right) =>
    left.eventId.localeCompare(right.eventId),
  );
  if (normalizedActual.length !== normalizedExpected.length)
    throw new Error("stored_event_mismatch");
  for (let index = 0; index < normalizedExpected.length; index += 1) {
    const stored = normalizedActual[index];
    const observed = normalizedExpected[index];
    if (JSON.stringify(stored) !== JSON.stringify(observed))
      throw new Error("stored_event_mismatch");
  }
}

/**
 * Atomically persists one caller-supplied finalized canonical batch. It does
 * not fetch chain data or choose finality policy; callers supply both.
 */
export async function storeFinalizedEvents(pool, batch) {
  if (!pool || typeof pool.connect !== "function") invalid("pool");
  if (!batch || typeof batch !== "object") invalid("batch");
  const chainId = normalizeChainId(batch.chainId);
  const contractAddress = normalizeContractAddress(batch.contractAddress);
  const blocks = normalizeBlocks(batch.blocks);
  const checkpoint = normalizeCheckpoint(
    batch.checkpoint,
    chainId,
    contractAddress,
  );
  const terminal = blocks.at(-1);
  if (
    terminal.blockNumber !== checkpoint.blockNumber ||
    terminal.blockHash !== checkpoint.blockHash
  )
    throw new Error("checkpoint_not_batch_tip");
  const logs = normalizeAndSortLogs(chainId, batch.logs);
  const blocksByHeight = new Map(
    blocks.map((block) => [block.blockNumber, block]),
  );
  for (const log of logs) {
    const block = blocksByHeight.get(log.blockNumber);
    if (log.contractAddress !== contractAddress)
      invalid("logs.contractAddress");
    if (!block || block.blockHash !== log.blockHash)
      throw new Error("log_not_in_supplied_blocks");
  }

  const maxRollbackDepth = normalizeNonnegativeQuantity(
    batch.maxRollbackDepth,
    "maxRollbackDepth",
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Row locks cannot serialize the first writer because no checkpoint row
    // exists yet. This transaction-scoped lock is keyed by the normalized
    // indexer scope and is released automatically on commit or rollback.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      [chainId, contractAddress],
    );
    const storedCheckpoint = await client.query(
      `SELECT block_number, block_hash
         FROM chain_indexer_checkpoints
        WHERE chain_id = $1 AND contract_address = $2
        FOR UPDATE`,
      [chainId, contractAddress],
    );

    let replayBlocks = blocks;
    let deleteFromBlockNumber = null;
    let rollbackDepth = "0";
    if (storedCheckpoint.rowCount) {
      const current = storedCheckpoint.rows[0];
      if (BigInt(checkpoint.blockNumber) < BigInt(current.block_number))
        throw new Error("stale_checkpoint");
      const lowerBound = (
        BigInt(current.block_number) - BigInt(maxRollbackDepth) < 0n
          ? 0n
          : BigInt(current.block_number) - BigInt(maxRollbackDepth)
      ).toString();
      const canonical = await client.query(
        `SELECT block_number, block_hash, parent_hash
           FROM chain_indexer_canonical_blocks
          WHERE chain_id = $1 AND contract_address = $2
            AND block_number BETWEEN $3 AND $4
          ORDER BY block_number
          FOR UPDATE`,
        [chainId, contractAddress, lowerBound, String(current.block_number)],
      );
      const plan = planReorgRollback({
        checkpoint: {
          blockNumber: current.block_number,
          blockHash: current.block_hash,
          parentHash: canonical.rows.at(-1)?.parent_hash,
        },
        canonicalBlocks: canonical.rows.map((block) => ({
          blockNumber: block.block_number,
          blockHash: block.block_hash,
          parentHash: block.parent_hash,
        })),
        observedBlocks: blocks,
        maxRollbackDepth,
      });
      const suppliedBlocksByIdentity = new Map(
        blocks.map((block) => [blockIdentity(block), block]),
      );
      replayBlocks = plan.replayBlocks.map((block) => {
        const suppliedBlock = suppliedBlocksByIdentity.get(
          blockIdentity(block),
        );
        if (!suppliedBlock || !suppliedBlock.blockTimestamp)
          throw new Error("replay_block_not_in_supplied_blocks");
        return suppliedBlock;
      });
      deleteFromBlockNumber = plan.deleteFromBlockNumber;
      rollbackDepth = plan.rollbackDepth;
    }

    if (deleteFromBlockNumber !== null) {
      await client.query(
        `DELETE FROM chain_indexer_raw_events
          WHERE chain_id = $1 AND contract_address = $2 AND block_number >= $3`,
        [chainId, contractAddress, deleteFromBlockNumber],
      );
      await client.query(
        `DELETE FROM chain_indexer_canonical_blocks
          WHERE chain_id = $1 AND contract_address = $2 AND block_number >= $3`,
        [chainId, contractAddress, deleteFromBlockNumber],
      );
    }

    for (const block of replayBlocks) {
      await client.query(
        `INSERT INTO chain_indexer_canonical_blocks
          (chain_id, contract_address, block_number, block_hash, parent_hash, block_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (chain_id, contract_address, block_number) DO NOTHING`,
        [
          chainId,
          contractAddress,
          block.blockNumber,
          block.blockHash,
          block.parentHash,
          block.blockTimestamp,
        ],
      );
    }
    for (const log of logs) {
      await client.query(
        `INSERT INTO chain_indexer_raw_events
          (chain_id, contract_address, transaction_hash, log_index, block_number, block_hash, transaction_index, topics, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
         ON CONFLICT (chain_id, contract_address, transaction_hash, log_index) DO NOTHING`,
        [
          chainId,
          contractAddress,
          log.transactionHash,
          log.logIndex,
          log.blockNumber,
          log.blockHash,
          log.transactionIndex,
          JSON.stringify(log.topics),
          log.data,
        ],
      );
    }

    const firstBlock = blocks[0].blockNumber;
    const storedBlocks = await client.query(
      `SELECT block_number, block_hash, parent_hash, block_timestamp
         FROM chain_indexer_canonical_blocks
        WHERE chain_id = $1 AND contract_address = $2 AND block_number BETWEEN $3 AND $4
        ORDER BY block_number`,
      [chainId, contractAddress, firstBlock, checkpoint.blockNumber],
    );
    assertSameBlocks(storedBlocks.rows, blocks);
    const storedLogs = await client.query(
      `SELECT transaction_hash, log_index, block_number, block_hash, transaction_index, contract_address, topics, data
         FROM chain_indexer_raw_events
        WHERE chain_id = $1 AND contract_address = $2 AND block_number BETWEEN $3 AND $4
        ORDER BY block_number, transaction_index, log_index, transaction_hash`,
      [chainId, contractAddress, firstBlock, checkpoint.blockNumber],
    );
    assertSameLogs(chainId, storedLogs.rows, logs);
    await client.query(
      `INSERT INTO chain_indexer_checkpoints (chain_id, contract_address, block_number, block_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chain_id, contract_address)
       DO UPDATE SET block_number = EXCLUDED.block_number, block_hash = EXCLUDED.block_hash, updated_at = now()`,
      [chainId, contractAddress, checkpoint.blockNumber, checkpoint.blockHash],
    );
    await client.query("COMMIT");
    return {
      chainId,
      contractAddress,
      checkpoint,
      rollbackDepth,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}
