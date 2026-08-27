import { getAddress, isAddress, keccak256, stringToHex } from "viem";
import {
  normalizeChainId,
  normalizeContractAddress,
} from "./chain-indexer-core.js";

export const UPGRADE_STARTED_SELECTOR = keccak256(
  stringToHex("UpgradeStarted(address,uint8,uint64)"),
).toLowerCase();
export const BUILDING_UPGRADED_SELECTOR = keccak256(
  stringToHex("BuildingUpgraded(address,uint8,uint256)"),
).toLowerCase();
const selectors = new Set([
  UPGRADE_STARTED_SELECTOR,
  BUILDING_UPGRADED_SELECTOR,
]);
const CURSOR_VERSION = 1;
const MAX_PAGE_SIZE = 50;
const invalid = (value) => {
  throw new Error(`invalid_build_history:${value}`);
};

function topicAddress(topic) {
  if (typeof topic !== "string" || !/^0x0{24}[0-9a-fA-F]{40}$/.test(topic))
    return null;
  const value = `0x${topic.slice(-40)}`;
  return isAddress(value) ? getAddress(value) : null;
}
function topics(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function word(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
    ? BigInt(value)
    : null;
}

/** Strict projection of the two player-owned finalized construction facts. */
export function decodeBuildHistoryEvent(row, walletAddress) {
  const loggedTopics = topics(row.topics);
  if (
    !loggedTopics ||
    loggedTopics.length !== 3 ||
    !selectors.has(loggedTopics[0]?.toLowerCase()) ||
    !isAddress(walletAddress)
  )
    return null;
  const player = topicAddress(loggedTopics[1]);
  const building = word(loggedTopics[2]);
  if (
    !player ||
    player !== getAddress(walletAddress) ||
    building === null ||
    building > 7n ||
    !/^0x[0-9a-fA-F]{64}$/.test(row.data) ||
    !/^0x[0-9a-fA-F]{64}$/.test(row.transaction_hash) ||
    !Number.isSafeInteger(Number(row.log_index)) ||
    Number(row.log_index) < 0
  )
    return null;
  const value = word(row.data);
  if (value === null) return null;
  const timestamp = new Date(row.block_timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;
  const kind =
    loggedTopics[0].toLowerCase() === UPGRADE_STARTED_SELECTOR
      ? "upgrade_started"
      : "building_upgraded";
  if (
    (kind === "upgrade_started" && value > 2n ** 64n - 1n) ||
    (kind === "building_upgraded" && (value < 1n || value > 30n))
  )
    return null;
  return {
    kind,
    building: Number(building),
    value: value.toString(),
    blockNumber: String(row.block_number),
    blockTimestamp: timestamp.toISOString(),
    transactionHash: row.transaction_hash,
    logIndex: Number(row.log_index),
  };
}

function decodeCursor(value, scope, wallet) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      cursor.v !== CURSOR_VERSION ||
      cursor.chainId !== scope.chainId ||
      cursor.contractAddress !== scope.contractAddress ||
      cursor.wallet !== wallet ||
      typeof cursor.checkpoint !== "string" ||
      !/^\d+:0x[0-9a-fA-F]{64}$/.test(cursor.checkpoint) ||
      !/^\d+$/.test(cursor.blockNumber) ||
      !Number.isSafeInteger(cursor.transactionIndex) ||
      cursor.transactionIndex < 0 ||
      !Number.isSafeInteger(cursor.logIndex) ||
      cursor.logIndex < 0 ||
      !/^0x[0-9a-fA-F]{64}$/.test(cursor.transactionHash)
    )
      invalid("cursor");
    return cursor;
  } catch (error) {
    if (String(error?.message).startsWith("invalid_build_history:"))
      throw error;
    invalid("cursor");
  }
}
function encodeCursor(scope, wallet, checkpoint, row) {
  return Buffer.from(
    JSON.stringify({
      v: CURSOR_VERSION,
      ...scope,
      wallet,
      checkpoint,
      blockNumber: String(row.block_number),
      transactionIndex: Number(row.transaction_index),
      logIndex: Number(row.log_index),
      transactionHash: row.transaction_hash,
    }),
  ).toString("base64url");
}
export function parseBuildHistoryQuery(searchParams) {
  for (const key of searchParams.keys())
    if (
      (key !== "cursor" && key !== "limit") ||
      searchParams.getAll(key).length !== 1
    )
      invalid("query");
  const rawLimit = searchParams.get("limit");
  if (
    rawLimit !== null &&
    (!/^[1-9][0-9]*$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit)))
  )
    invalid("limit");
  return {
    cursor: searchParams.get("cursor"),
    limit: Math.min(Number(rawLimit ?? 20), MAX_PAGE_SIZE),
  };
}

/** Reads stored finalized facts only; it never reaches an RPC provider. */
export async function readPersonalBuildHistory(
  pool,
  { chainId, contractAddress, walletAddress, cursor, limit = 20 },
) {
  if (!pool || typeof pool.connect !== "function") invalid("database");
  const scope = {
    chainId: normalizeChainId(chainId),
    contractAddress: normalizeContractAddress(contractAddress),
  };
  if (!isAddress(walletAddress) || getAddress(walletAddress) !== walletAddress)
    invalid("wallet");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE)
    invalid("limit");
  const parsedCursor = decodeCursor(cursor, scope, walletAddress);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const checkpointResult = await client.query(
      "SELECT block_number, block_hash, updated_at FROM chain_indexer_checkpoints WHERE chain_id = $1 AND contract_address = $2",
      [scope.chainId, scope.contractAddress],
    );
    if (!checkpointResult.rowCount) {
      await client.query("COMMIT");
      return {
        availability: "no_stored_replay",
        coverage: { complete: false },
        events: [],
        nextCursor: null,
      };
    }
    const checkpoint = checkpointResult.rows[0];
    const block = String(checkpoint.block_number);
    const hash = String(checkpoint.block_hash).toLowerCase();
    if (!/^\d+$/.test(block) || !/^0x[0-9a-f]{64}$/.test(hash))
      throw new Error("build_history_stored_history_corruption");
    const identity = `${block}:${hash}`;
    if (parsedCursor && parsedCursor.checkpoint !== identity)
      throw new Error("build_history_checkpoint_changed");
    const rows = await client.query(
      `SELECT e.block_number, e.transaction_index, e.log_index, e.transaction_hash, e.topics, e.data, b.block_timestamp FROM chain_indexer_raw_events e JOIN chain_indexer_canonical_blocks b ON b.chain_id=e.chain_id AND b.contract_address=e.contract_address AND b.block_number=e.block_number AND b.block_hash=e.block_hash WHERE e.chain_id=$1 AND e.contract_address=$2 AND e.topics->>0 = ANY($3::text[]) AND e.topics->>1=$4 AND ($5::bigint IS NULL OR (e.block_number,e.transaction_index,e.log_index,e.transaction_hash) < ($5::bigint,$6::integer,$7::integer,$8)) ORDER BY e.block_number DESC,e.transaction_index DESC,e.log_index DESC,e.transaction_hash DESC LIMIT $9`,
      [
        scope.chainId,
        scope.contractAddress,
        [...selectors],
        `0x${walletAddress.slice(2).padStart(64, "0").toLowerCase()}`,
        parsedCursor?.blockNumber ?? null,
        parsedCursor?.transactionIndex ?? null,
        parsedCursor?.logIndex ?? null,
        parsedCursor?.transactionHash ?? null,
        limit + 1,
      ],
    );
    const decoded = rows.rows.map((row) => {
      const event = decodeBuildHistoryEvent(row, walletAddress);
      if (!event) throw new Error("build_history_stored_history_corruption");
      return { row, event };
    });
    const page = decoded.slice(0, limit);
    await client.query("COMMIT");
    return {
      availability: "stored_finalized_events",
      coverage: {
        complete: false,
        checkpoint: {
          blockNumber: block,
          blockHash: checkpoint.block_hash,
          updatedAt: new Date(checkpoint.updated_at).toISOString(),
        },
      },
      events: page.map(({ event }) => event),
      nextCursor:
        decoded.length > limit
          ? encodeCursor(scope, walletAddress, identity, page.at(-1).row)
          : null,
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
