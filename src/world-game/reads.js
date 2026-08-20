import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  zeroAddress,
} from "viem";
import { CIVILIZATION_GAME_ABI } from "../abi/CivilizationGame.js";
import { WORLD_CHAIN_MAINNET_RPC_URL } from "../world-chain.js";
import {
  BUILDING_IDS,
  BUILDING_INDEX,
  CIVILIZATION_GAME_ADDRESS,
  FRACTION_SCALE,
  TROOP_IDS,
  monotonicNow,
} from "./constants.js";

export const worldGameClient = createPublicClient({
  transport: http(WORLD_CHAIN_MAINNET_RPC_URL),
});

const tuple = (value, name, index) => value?.[name] ?? value?.[index] ?? 0n;
const number = (value) => Number(value ?? 0n);
const resourceTuple = (value) => ({
  wood: number(tuple(value, "wood", 0)),
  clay: number(tuple(value, "clay", 1)),
  stone: number(tuple(value, "stone", 2)),
  gold: number(tuple(value, "gold", 3)),
});
const buildingTuple = (value) =>
  Object.fromEntries(
    BUILDING_IDS.map((id, index) => [id, number(tuple(value, id, index))]),
  );
const troopTuple = (value) =>
  Object.fromEntries(
    TROOP_IDS.map((id, index) => [id, number(tuple(value, id, index))]),
  );

export function decodeCivilizationState(
  raw,
  goldBalance,
  accrual = null,
  chainTimestamp = null,
  queue = null,
) {
  const raid = raw?.[7];
  const build = raw?.[8];
  const building = number(tuple(build, "building", 1));
  const defender = tuple(raid, "defender", 0);
  const field = resourceTuple(raw?.[4]);
  const readTimestamp =
    chainTimestamp === null
      ? number(raw?.[1]) * 1000
      : number(chainTimestamp) * 1000;
  const legacyConstruction = {
    pending: Boolean(tuple(build, "pending", 0)),
    building,
    buildingId: BUILDING_IDS[building] || "townhall",
    completesAt: number(tuple(build, "completesAt", 2)) * 1000,
    // Slot zero remains backed by the legacy playerState tuple. Giving it an
    // explicit slot lets the UI keep every job, its wallet intent, and later
    // readback keyed to the same construction.
    slot: 0,
  };
  const jobs = (queue?.jobs || []).map((packed, slot) => {
    const jobBuilding = Number((packed >> 8n) & 0xffn);
    return {
      pending: Boolean(packed & 1n),
      building: jobBuilding,
      buildingId: BUILDING_IDS[jobBuilding] || "townhall",
      completesAt: Number(packed >> 16n) * 1000,
      slot,
    };
  });
  const constructions = [
    ...(legacyConstruction.pending ? [legacyConstruction] : []),
    ...jobs.filter((job) => job.slot > 0 && job.pending),
  ];
  return {
    registered: Boolean(raw?.[0]),
    resources: {
      ...resourceTuple(raw?.[3]),
      gold: Number(formatUnits(goldBalance ?? 0n, 18)),
    },
    unclaimed: field,
    buildings: buildingTuple(raw?.[5]),
    troops: troopTuple(raw?.[6]),
    targets: [],
    raids: 0,
    lastRaid: null,
    gatherAvailableAt: number(raw?.[2]) * 1000,
    pendingRaid:
      defender && defender !== zeroAddress
        ? {
            kind: "pvp",
            targetId: getAddress(defender),
            arrivesAt: number(tuple(raid, "arrivesAt", 1)) * 1000,
            army: {
              spear: number(tuple(raid, "spear", 2)),
              archer: number(tuple(raid, "archer", 3)),
              rider: number(tuple(raid, "rider", 4)),
            },
          }
        : null,
    // Kept for old UI integrations; `constructions` is the authoritative list.
    construction: constructions[0] || legacyConstruction,
    constructions,
    constructionCapacity:
      buildingTuple(raw?.[5]).workshop >= 21
        ? 3
        : buildingTuple(raw?.[5]).workshop >= 11
          ? 2
          : 1,
    constructionOccupied: constructions.length,
    prestigeCount: number(raw?.[9]),
    last: number(raw?.[1]) * 1000,
    chainTimestamp: chainTimestamp === null ? null : readTimestamp,
    performanceAnchor: monotonicNow(),
    accrual: accrual
      ? {
          wholeField: resourceTuple(accrual?.[0]),
          fractionalRemainder: resourceTuple(accrual?.[1]),
          fractionScale: number(accrual?.[2]),
          asOf: number(accrual?.[3]) * 1000,
        }
      : {
          wholeField: field,
          fractionalRemainder: { wood: 0, clay: 0, stone: 0, gold: 0 },
          fractionScale: FRACTION_SCALE,
          asOf: readTimestamp,
        },
  };
}

export async function readRawState(
  account,
  includeGold = true,
  contractAddress = CIVILIZATION_GAME_ADDRESS,
) {
  const address = getAddress(account);
  const game = getAddress(contractAddress);
  const blockNumber = await worldGameClient.getBlockNumber();
  const [raw, gold, accrual, queue, block] = await Promise.all([
    worldGameClient.readContract({
      address: game,
      abi: CIVILIZATION_GAME_ABI,
      functionName: "previewPlayerState",
      args: [address],
      blockNumber,
    }),
    includeGold
      ? worldGameClient.readContract({
          address: game,
          abi: CIVILIZATION_GAME_ABI,
          functionName: "balanceOf",
          args: [address],
          blockNumber,
        })
      : 0n,
    worldGameClient
      .readContract({
        address: game,
        abi: CIVILIZATION_GAME_ABI,
        functionName: "previewAccrual",
        args: [address],
        blockNumber,
      })
      .catch(() => null),
    Promise.all(
      [0, 1, 2].map((slot) =>
        worldGameClient.readContract({
          address: game,
          abi: CIVILIZATION_GAME_ABI,
          functionName: "constructionJob",
          args: [address, slot],
          blockNumber,
        }),
      ),
    )
      .then((jobs) => ({ jobs }))
      .catch(() => null),
    worldGameClient.getBlock({ blockNumber }),
  ]);
  return decodeCivilizationState(raw, gold, accrual, block.timestamp, queue);
}

export async function readCivilizationState(
  account,
  contractAddress = CIVILIZATION_GAME_ADDRESS,
) {
  if (!isAddress(account)) throw new Error("invalid_wallet");
  return readRawState(account, true, contractAddress);
}

export async function readContractBuildDuration(
  buildingId,
  nextLevel,
  contractAddress = CIVILIZATION_GAME_ADDRESS,
) {
  if (!Object.hasOwn(BUILDING_INDEX, buildingId))
    throw new Error("invalid_building");
  if (!Number.isInteger(nextLevel) || nextLevel < 1 || nextLevel > 30)
    throw new Error("invalid_building_level");
  return worldGameClient.readContract({
    address: getAddress(contractAddress),
    abi: CIVILIZATION_GAME_ABI,
    functionName: "buildDuration",
    args: [BUILDING_INDEX[buildingId], BigInt(nextLevel)],
  });
}
