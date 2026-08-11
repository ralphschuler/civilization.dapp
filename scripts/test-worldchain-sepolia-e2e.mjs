import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, keccak256, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const worldchainSepolia = defineChain({
  id: 4801,
  name: "World Chain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://worldchain-sepolia.g.alchemy.com/public"] } },
  testnet: true,
});
const deployment = {
  game: getAddress(process.env.CIVILIZATION_TESTNET_GAME ?? "0xfCdB50926c3c6b2CDF3ACE76B13c9383A2DC3199"),
  worldToken: getAddress(process.env.CIVILIZATION_TESTNET_WORLD_TOKEN ?? "0x29147C7BEAd901E8019d7911A7DC404447877C62"),
  worldIdVerifier: getAddress(process.env.CIVILIZATION_TESTNET_WORLD_ID_VERIFIER ?? "0x1A64F89881FD2E38255E62c6D62b68076052DF4b"),
  treasury: getAddress("0x4338aa98a8c969ca0675a8b0dcc7ed51f24ab886"),
};
const send = process.argv.includes("--send");
const keyFile = process.env.WORLDCHAIN_TESTNET_KEY_FILE ?? `${homedir()}/.config/civilization-dapp/worldchain-mainnet.json`;

const resources = [
  { name: "wood", type: "uint256" }, { name: "clay", type: "uint256" },
  { name: "stone", type: "uint256" }, { name: "gold", type: "uint256" },
];
const buildings = [
  { name: "townhall", type: "uint256" }, { name: "timber", type: "uint256" }, { name: "claypit", type: "uint256" },
  { name: "quarry", type: "uint256" }, { name: "warehouse", type: "uint256" }, { name: "workshop", type: "uint256" },
  { name: "goldmine", type: "uint256" }, { name: "barracks", type: "uint256" },
];
const gameAbi = [
  { type: "function", name: "worldIdVerifier", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "worldToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "boostTreasury", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "registerWorldId", stateMutability: "nonpayable", inputs: [
    { name: "nullifierHash", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "signalHash", type: "uint256" },
    { name: "expiresAtMin", type: "uint64" }, { name: "issuerSchemaId", type: "uint64" }, { name: "proof", type: "uint256[5]" },
  ], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "upgrade", stateMutability: "nonpayable", inputs: [{ name: "building", type: "uint8" }], outputs: [] },
  { type: "function", name: "completeUpgrade", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "boostConstruction", stateMutability: "nonpayable", inputs: [{ name: "hoursToBoost", type: "uint256" }], outputs: [] },
  { type: "function", name: "playerState", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [
    { name: "registered", type: "bool" }, { name: "lastAccruedAt", type: "uint64" }, { name: "claimAvailableAt", type: "uint64" },
    { name: "stored", type: "tuple", components: resources }, { name: "field", type: "tuple", components: resources },
    { name: "buildings", type: "tuple", components: buildings },
    { name: "troops", type: "tuple", components: [{ name: "spear", type: "uint256" }, { name: "archer", type: "uint256" }, { name: "rider", type: "uint256" }] },
    { name: "pendingRaid", type: "tuple", components: [{ name: "defender", type: "address" }, { name: "arrivesAt", type: "uint64" }, { name: "spear", type: "uint256" }, { name: "archer", type: "uint256" }, { name: "rider", type: "uint256" }] },
    { name: "construction", type: "tuple", components: [{ name: "pending", type: "bool" }, { name: "building", type: "uint8" }, { name: "completesAt", type: "uint64" }] },
    { name: "prestigeCount", type: "uint256" },
  ] },
];
const tokenAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "account", type: "address" }, { name: "value", type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
];

const publicClient = createPublicClient({ chain: worldchainSepolia, transport: http(worldchainSepolia.rpcUrls.default.http[0]) });
const { receiverPrivateKey } = JSON.parse(await readFile(keyFile, "utf8"));
if (!receiverPrivateKey) throw new Error("testnet key file lacks receiverPrivateKey");
const account = privateKeyToAccount(receiverPrivateKey);
const walletClient = createWalletClient({ account, chain: worldchainSepolia, transport: http(worldchainSepolia.rpcUrls.default.http[0]) });

async function readState() {
  const raw = await publicClient.readContract({ address: deployment.game, abi: gameAbi, functionName: "playerState", args: [account.address] });
  return {
    registered: raw[0],
    lastAccruedAt: raw[1],
    claimAvailableAt: raw[2],
    stored: raw[3],
    field: raw[4],
    buildings: raw[5],
    troops: raw[6],
    pendingRaid: raw[7],
    construction: raw[8],
    prestigeCount: raw[9],
  };
}

async function writeContract(request) {
  const hash = await walletClient.writeContract({ account, ...request });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`testnet transaction failed: ${hash}`);
  return hash;
}

const [chainId, code, verifier, token, treasury, state, nativeBalance] = await Promise.all([
  publicClient.getChainId(), publicClient.getCode({ address: deployment.game }),
  publicClient.readContract({ address: deployment.game, abi: gameAbi, functionName: "worldIdVerifier" }),
  publicClient.readContract({ address: deployment.game, abi: gameAbi, functionName: "worldToken" }),
  publicClient.readContract({ address: deployment.game, abi: gameAbi, functionName: "boostTreasury" }),
  readState(), publicClient.getBalance({ address: account.address }),
]);
if (chainId !== worldchainSepolia.id || !code || verifier !== deployment.worldIdVerifier || token !== deployment.worldToken || treasury !== deployment.treasury) {
  throw new Error("deployed testnet contract configuration does not match the expected manifest");
}

const report = {
  network: worldchainSepolia.name,
  chainId,
  game: deployment.game,
  player: account.address,
  nativeBalanceWei: nativeBalance,
  configured: true,
  registered: state.registered,
  construction: state.construction,
  stored: state.stored,
  transactions: [],
};
if (!send) {
  console.log(JSON.stringify(report, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
  process.exit(0);
}
if (process.env.CONFIRM_TESTNET_E2E !== "yes") throw new Error("set CONFIRM_TESTNET_E2E=yes to submit testnet game transactions");

let current = state;
if (!current.registered) {
  const wallet = getAddress(account.address);
  const signalHash = BigInt(keccak256(wallet)) >> 8n;
  const nullifierHash = BigInt(keccak256(stringToHex(`civilization-testnet:${wallet.toLowerCase()}`)));
  report.transactions.push({ step: "mock_world_id_registration", hash: await writeContract({ address: deployment.game, abi: gameAbi, functionName: "registerWorldId", args: [nullifierHash, 2002n, signalHash, 3000n, 1n, [11n, 12n, 13n, 14n, 15n]] }) });
  current = await readState();
}

// Finish a previously boosted upgrade once its last partial hour elapsed. Do
// not immediately queue a new upgrade in that same run: this keeps reruns
// idempotent and makes the completed level visible in the report.
let completedExistingConstruction = false;
const blockBeforeActions = await publicClient.getBlock();
if (current.construction.pending && current.construction.completesAt <= blockBeforeActions.timestamp) {
  report.transactions.push({ step: "complete_upgrade", hash: await writeContract({ address: deployment.game, abi: gameAbi, functionName: "completeUpgrade" }) });
  current = await readState();
  completedExistingConstruction = true;
}

if (!current.construction.pending && !completedExistingConstruction) {
  report.transactions.push({ step: "queue_timber_upgrade", hash: await writeContract({ address: deployment.game, abi: gameAbi, functionName: "upgrade", args: [1] }) });
  current = await readState();
}

const latestBlock = await publicClient.getBlock();
const remaining = current.construction.pending && current.construction.completesAt > latestBlock.timestamp
  ? current.construction.completesAt - latestBlock.timestamp : 0n;
const boostHours = remaining / (60n * 60n);
if (boostHours > 0n) {
  const wld = boostHours * 10n ** 18n;
  report.transactions.push({ step: "mint_mock_wld", hash: await writeContract({ address: deployment.worldToken, abi: tokenAbi, functionName: "mint", args: [account.address, wld] }) });
  report.transactions.push({ step: "approve_mock_wld", hash: await writeContract({ address: deployment.worldToken, abi: tokenAbi, functionName: "approve", args: [deployment.game, wld] }) });
  report.transactions.push({ step: "boost_construction", hash: await writeContract({ address: deployment.game, abi: gameAbi, functionName: "boostConstruction", args: [boostHours] }) });
}

const [after, treasuryMockWld] = await Promise.all([
  readState(), publicClient.readContract({ address: deployment.worldToken, abi: tokenAbi, functionName: "balanceOf", args: [deployment.treasury] }),
]);
report.after = { construction: after.construction, stored: after.stored, treasuryMockWld };
console.log(JSON.stringify(report, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
