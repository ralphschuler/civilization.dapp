const resources = [
  { name: "wood", type: "uint256" },
  { name: "clay", type: "uint256" },
  { name: "stone", type: "uint256" },
  { name: "gold", type: "uint256" },
];
const buildings = [
  { name: "townhall", type: "uint256" },
  { name: "timber", type: "uint256" },
  { name: "claypit", type: "uint256" },
  { name: "quarry", type: "uint256" },
  { name: "warehouse", type: "uint256" },
  { name: "workshop", type: "uint256" },
  { name: "goldmine", type: "uint256" },
  { name: "barracks", type: "uint256" },
];
const troops = [
  { name: "spear", type: "uint256" },
  { name: "archer", type: "uint256" },
  { name: "rider", type: "uint256" },
];
const raid = [
  { name: "defender", type: "address" },
  { name: "arrivesAt", type: "uint64" },
  { name: "spear", type: "uint256" },
  { name: "archer", type: "uint256" },
  { name: "rider", type: "uint256" },
];
const construction = [
  { name: "pending", type: "bool" },
  { name: "building", type: "uint8" },
  { name: "completesAt", type: "uint64" },
];

/**
 * Dormant ABI compatibility for the already-published proxy. No active
 * browser or server flow imports these registration functions.
 */
export const CIVILIZATION_WORLD_ID_COMPATIBILITY_ABI = [
  {
    type: "function",
    name: "registerWorldId",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nullifierHash", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "signalHash", type: "uint256" },
      { name: "expiresAtMin", type: "uint64" },
      { name: "issuerSchemaId", type: "uint64" },
      { name: "proof", type: "uint256[5]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "registerWorldIdLegacy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "root", type: "uint256" },
      { name: "signalHash", type: "uint256" },
      { name: "nullifierHash", type: "uint256" },
      { name: "proof", type: "uint256[8]" },
    ],
    outputs: [],
  },
];

export const CIVILIZATION_GAME_ABI = [
  {
    type: "function",
    name: "registerWallet",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "previewPlayerState",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "registered", type: "bool" },
      { name: "lastAccruedAt", type: "uint64" },
      { name: "claimAvailableAt", type: "uint64" },
      { name: "stored", type: "tuple", components: resources },
      { name: "field", type: "tuple", components: resources },
      { name: "buildings", type: "tuple", components: buildings },
      { name: "troops", type: "tuple", components: troops },
      { name: "pendingRaid", type: "tuple", components: raid },
      { name: "construction", type: "tuple", components: construction },
      { name: "prestigeCount", type: "uint256" },
    ],
  },
  {
    // Added by the proxy release.  Keeping this entry separate lets callers
    // feature-detect it and continue reading the current immutable release.
    type: "function",
    name: "previewAccrual",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "wholeField", type: "tuple", components: resources },
      { name: "fractionalRemainder", type: "tuple", components: resources },
      { name: "fractionScale", type: "uint256" },
      { name: "asOf", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteMarket",
    stateMutability: "view",
    inputs: [
      { name: "resource", type: "uint8" },
      { name: "resourceAmount", type: "uint256" },
    ],
    outputs: [
      { name: "buyGoldIn", type: "uint256" },
      { name: "buyFee", type: "uint256" },
      { name: "sellGoldOut", type: "uint256" },
      { name: "sellFee", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "marketInventory",
    stateMutability: "view",
    inputs: [{ name: "resource", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "marketGoldReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    // The contract is the sole authority for the rational, upward-rounded
    // construction curve; clients must read this instead of approximating it.
    type: "function",
    name: "buildDuration",
    stateMutability: "pure",
    inputs: [
      { name: "building", type: "uint8" },
      { name: "nextLevel", type: "uint256" },
    ],
    outputs: [{ name: "durationSeconds", type: "uint256" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "buyResource",
    stateMutability: "nonpayable",
    inputs: [
      { name: "resource", type: "uint8" },
      { name: "resourceAmount", type: "uint256" },
      { name: "maxGoldIn", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "sellResource",
    stateMutability: "nonpayable",
    inputs: [
      { name: "resource", type: "uint8" },
      { name: "resourceAmount", type: "uint256" },
      { name: "minGoldOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "upgrade",
    stateMutability: "nonpayable",
    inputs: [{ name: "building", type: "uint8" }],
    outputs: [],
  },
  {
    type: "function",
    name: "completeUpgrade",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "completeUpgrade",
    stateMutability: "nonpayable",
    inputs: [{ name: "slot", type: "uint8" }],
    outputs: [],
  },
  {
    type: "function",
    name: "boostConstruction",
    stateMutability: "nonpayable",
    inputs: [{ name: "hoursToBoost", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "boostConstruction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "slot", type: "uint8" },
      { name: "hoursToBoost", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "constructionJob",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "slot", type: "uint8" },
    ],
    outputs: [{ name: "packed", type: "uint256" }],
  },
  {
    type: "function",
    name: "train",
    stateMutability: "nonpayable",
    inputs: [
      { name: "troop", type: "uint8" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "startRaid",
    stateMutability: "nonpayable",
    inputs: [
      { name: "defender", type: "address" },
      { name: "spear", type: "uint256" },
      { name: "archer", type: "uint256" },
      { name: "rider", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveRaid",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "prestige",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "event",
    name: "WalletRegistered",
    anonymous: false,
    inputs: [{ name: "player", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "RaidResolved",
    anonymous: false,
    inputs: [
      { name: "attacker", type: "address", indexed: true },
      { name: "defender", type: "address", indexed: true },
      { name: "attackerWon", type: "bool", indexed: false },
      { name: "attack", type: "uint256", indexed: false },
      { name: "defense", type: "uint256", indexed: false },
      { name: "wood", type: "uint256", indexed: false },
      { name: "clay", type: "uint256", indexed: false },
      { name: "stone", type: "uint256", indexed: false },
      { name: "gold", type: "uint256", indexed: false },
    ],
  },
];

export const WORLD_TOKEN_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];
