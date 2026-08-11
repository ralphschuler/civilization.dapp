import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createBlock } from "@ethereumjs/block";
import { bytesToHex, createAddressFromString, hexToBytes } from "@ethereumjs/util";
import { createVM } from "@ethereumjs/vm";
import solc from "solc";
import {
  concatHex,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  padHex,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const contractsDirectory = new URL("../contracts/src/", import.meta.url);

async function compileContracts() {
  const files = (await readdir(contractsDirectory)).filter((file) => file.endsWith(".sol")).sort();
  const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [
    `contracts/src/${file}`,
    { content: await readFile(new URL(`../contracts/src/${file}`, import.meta.url), "utf8") },
  ])));
  return JSON.parse(solc.compile(JSON.stringify({
    language: "Solidity",
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  })));
}

const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);
const playerA = privateKeyToAccount(`0x${"22".repeat(32)}`);
const playerB = privateKeyToAccount(`0x${"33".repeat(32)}`);
const deployer = createAddressFromString(`0x${"44".repeat(20)}`);
const EVM_GAS_LIMIT = 30_000_000n;
const DAY = 86_400n;
const GOLD_UNIT = 10n ** 18n;
const PLAYER_MAPPING_SLOT = 3n;
const attestationTypes = {
  WorldIdAttestation: [
    { name: "player", type: "address" },
    { name: "nullifierHash", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "expiresAt", type: "uint64" },
  ],
};

function blockAt(timestamp) {
  return createBlock({ header: { timestamp } });
}

function assertEvmSuccess(result) {
  assert.equal(result.execResult.exceptionError, undefined, bytesToHex(result.execResult.returnValue));
}

async function deployGame(abi, bytecode, timestamp = 1_000n) {
  const vm = await createVM();
  const initCode = concatHex([
    `0x${bytecode}`,
    encodeAbiParameters([{ type: "address" }], [signer.address]),
  ]);
  const result = await vm.evm.runCall({
    caller: deployer,
    data: hexToBytes(initCode),
    gasLimit: EVM_GAS_LIMIT,
    block: blockAt(timestamp),
    skipBalance: true,
  });
  assertEvmSuccess(result);
  assert.ok(result.createdAddress, "constructor execution must create the game contract");
  return { vm, address: result.createdAddress, abi };
}

async function evmCall(game, caller, functionName, args, timestamp, { value = 0n, staticCall = false } = {}) {
  const data = encodeFunctionData({ abi: game.abi, functionName, args });
  return game.vm.evm.runCall({
    caller: createAddressFromString(caller),
    to: game.address,
    data: hexToBytes(data),
    gasLimit: EVM_GAS_LIMIT,
    value,
    isStatic: staticCall,
    block: blockAt(timestamp),
    skipBalance: true,
  });
}

async function readGame(game, functionName, args, timestamp) {
  const result = await evmCall(game, playerA.address, functionName, args, timestamp, { staticCall: true });
  assertEvmSuccess(result);
  return decodeFunctionResult({
    abi: game.abi,
    functionName,
    data: bytesToHex(result.execResult.returnValue),
  });
}

async function signedRegistration(game, player, nullifierHash, nonce, expiresAt) {
  const signature = await signer.signTypedData({
    domain: {
      name: "CivilizationGame",
      version: "1",
      chainId: 1,
      verifyingContract: game.address.toString(),
    },
    types: attestationTypes,
    primaryType: "WorldIdAttestation",
    message: { player: player.address, nullifierHash, nonce, expiresAt },
  });
  return evmCall(game, player.address, "registerWorldId", [nullifierHash, nonce, expiresAt, signature], expiresAt - 60n);
}

function playerStorageSlot(player, offset) {
  const mappingBase = BigInt(keccak256(encodeAbiParameters([
    { type: "address" },
    { type: "uint256" },
  ], [player, PLAYER_MAPPING_SLOT])));
  return padHex(toHex(mappingBase + BigInt(offset)), { size: 32 });
}

async function setPlayerStorage(game, player, offset, value) {
  await game.vm.stateManager.putStorage(
    game.address,
    hexToBytes(playerStorageSlot(player, offset)),
    hexToBytes(padHex(toHex(value), { size: 32 })),
  );
}

test("all Solidity drafts compile deterministically with the pinned official solc", async () => {
  assert.equal(solc.version(), "0.8.30+commit.73712a01.Emscripten.clang");
  const output = await compileContracts();
  const errors = (output.errors || []).filter((item) => item.severity === "error");
  assert.deepEqual(errors, [], errors.map((item) => item.formattedMessage).join("\n"));
  const game = output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame;
  assert.ok(game);
  assert.ok(game.evm.bytecode.object.length > 0, "constructor bytecode must be generated");
  assert.ok(game.evm.deployedBytecode.object.length / 2 <= 24_576, "runtime bytecode must fit the EIP-170 limit");
});

test("CivilizationGame exposes only player-driven game transitions and a signed registration gate", async () => {
  const output = await compileContracts();
  const abi = output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame.abi;
  const functions = new Map(abi.filter((item) => item.type === "function").map((item) => [item.name, item]));
  for (const name of ["registerWorldId", "claim", "upgrade", "completeUpgrade", "train", "startRaid", "resolveRaid", "prestige", "playerState", "name", "symbol", "decimals", "totalSupply", "balanceOf", "allowance", "approve", "transfer", "transferFrom"]) {
    assert.ok(functions.has(name), `${name} must be part of the auditable contract interface`);
  }
  assert.equal(functions.get("registerWorldId").stateMutability, "nonpayable");
  for (const name of ["claim", "upgrade", "train", "startRaid", "resolveRaid", "approve", "transfer", "transferFrom"]) {
    assert.equal(functions.get(name).stateMutability, "nonpayable", `${name} must not accept funds`);
  }
  const events = new Set(abi.filter((item) => item.type === "event").map((item) => item.name));
  for (const name of ["WorldIdRegistered", "ResourcesClaimed", "BuildingUpgraded", "TroopsTrained", "RaidStarted", "RaidResolved"]) assert.ok(events.has(name));
  assert.equal(functions.get("previewPlayerState").stateMutability, "view");
  assert.equal(functions.get("MAX_BUILDING_LEVEL").stateMutability, "view");
  assert.equal(functions.get("prestigeMultiplierBps").stateMutability, "pure");
});

test("contract source keeps backend authority limited to EIP-712 registration and protects replay paths", async () => {
  const source = await readFile(new URL("../contracts/src/CivilizationGame.sol", import.meta.url), "utf8");
  assert.match(source, /mapping\(bytes32 => address\) public nullifierOwner/);
  assert.match(source, /mapping\(bytes32 => bool\) public usedAttestationNonce/);
  assert.match(source, /MAX_ATTESTATION_TTL = 15 minutes/);
  assert.match(source, /_recover\(_hashTypedData\(structHash\), signature\) != backendAttestationSigner/);
  assert.match(source, /function _accrue\(Player storage player\) private/);
  assert.match(source, /function claim\(\) external onlyRegistered/);
  assert.match(source, /function resolveRaid\(\) external onlyRegistered/);
  assert.match(source, /MAX_BUILDING_LEVEL = 30/);
  assert.match(source, /function previewPlayerState\(address account\) external view/);
  assert.match(source, /function completeUpgrade\(\) external onlyRegistered/);
  assert.match(source, /function prestige\(\) external onlyRegistered/);
  assert.match(source, /return nextLevel \* 1 days/);
  assert.match(source, /PRESTIGE_BONUS_BPS = 1_000/);
  assert.match(source, /string public constant symbol = "CGOLD"/);
  assert.match(source, /function _mintGold\(address account, uint256 value\) private/);
  assert.match(source, /function _burnGold\(address account, uint256 value\) private/);
  assert.doesNotMatch(source, /function .*onlyBackend/i);
  assert.doesNotMatch(source, /\bpayable\b/);
});

test("CivilizationGame executes World registration, contract-derived production, claims, and replay protection on a local EVM", async () => {
  const output = await compileContracts();
  const artifact = output.contracts["contracts/src/CivilizationGame.sol"].CivilizationGame;
  const game = await deployGame(artifact.abi, artifact.evm.bytecode.object);
  const nullifier = `0x${"aa".repeat(32)}`;
  const nonce = `0x${"bb".repeat(32)}`;
  const registration = await signedRegistration(game, playerA, nullifier, nonce, 1_900n);
  assertEvmSuccess(registration);

  const registeredAt = 1_840n;
  const firstCollectionAt = registeredAt + DAY;
  const initial = await readGame(game, "playerState", [playerA.address], registeredAt);
  assert.equal(initial[0], true);
  assert.equal(initial[3].wood, 80n);
  assert.equal(initial[4].wood, 0n);

  const preview = await readGame(game, "previewPlayerState", [playerA.address], firstCollectionAt);
  assert.equal(preview[3].wood, 80n, "a view must not change stored resources");
  assert.equal(preview[4].wood, 300n, "the contract production formula must be visible before a claim");

  const claim = await evmCall(game, playerA.address, "claim", [], firstCollectionAt);
  assertEvmSuccess(claim);
  const afterClaim = await readGame(game, "playerState", [playerA.address], firstCollectionAt);
  assert.equal(afterClaim[3].wood, 380n);
  assert.equal(afterClaim[4].wood, 0n);

  const cooldownClaim = await evmCall(game, playerA.address, "claim", [], firstCollectionAt + 1n);
  assert.ok(cooldownClaim.execResult.exceptionError, "claim cooldown must revert on the EVM");

  // Fixture-only gold field stock isolates ERC-20 claim/transfer behavior from
  // the several-day Goldmine prerequisite path.
  await setPlayerStorage(game, playerA.address, 8, 19n);
  const goldClaimAt = firstCollectionAt + 2n * 60n * 60n;
  const goldClaim = await evmCall(game, playerA.address, "claim", [], goldClaimAt);
  assertEvmSuccess(goldClaim);
  assert.equal(await readGame(game, "balanceOf", [playerA.address], goldClaimAt), 19n * GOLD_UNIT);
  assert.equal(await readGame(game, "totalSupply", [], goldClaimAt), 19n * GOLD_UNIT);
  const goldTransfer = await evmCall(game, playerA.address, "transfer", [playerB.address, 7n * GOLD_UNIT], goldClaimAt);
  assertEvmSuccess(goldTransfer);
  assert.equal(await readGame(game, "balanceOf", [playerA.address], goldClaimAt), 12n * GOLD_UNIT);
  assert.equal(await readGame(game, "balanceOf", [playerB.address], goldClaimAt), 7n * GOLD_UNIT);

  const queueTownhall = await evmCall(game, playerA.address, "upgrade", [0], goldClaimAt);
  assertEvmSuccess(queueTownhall);
  const queued = await readGame(game, "playerState", [playerA.address], goldClaimAt);
  assert.equal(queued[5].townhall, 0n, "townhall level changes only after the construction timer");
  assert.equal(queued[8].pending, true);
  assert.equal(queued[8].completesAt, goldClaimAt + DAY);
  const earlyCompletion = await evmCall(game, playerA.address, "completeUpgrade", [], goldClaimAt + DAY - 1n);
  assert.ok(earlyCompletion.execResult.exceptionError, "townhall I cannot complete before its one-day timer");
  const completeTownhall = await evmCall(game, playerA.address, "completeUpgrade", [], goldClaimAt + DAY);
  assertEvmSuccess(completeTownhall);
  const afterTownhall = await readGame(game, "playerState", [playerA.address], goldClaimAt + DAY);
  assert.equal(afterTownhall[5].townhall, 1n);
  assert.equal(afterTownhall[8].pending, false);

  const prestigeMultiplier = await readGame(game, "prestigeMultiplierBps", [1n], goldClaimAt + DAY);
  assert.equal(prestigeMultiplier, 11_000n, "each prestige grants a permanent ten-percent production bonus");

  // Fixture-only storage setup reaches the explicit late-game prestige gate without
  // turning production tests into a multi-year sequence of timed upgrades.
  await setPlayerStorage(game, playerA.address, 13, 30n);
  const prestige = await evmCall(game, playerA.address, "prestige", [], goldClaimAt + DAY + 1n);
  assertEvmSuccess(prestige);
  const afterPrestige = await readGame(game, "playerState", [playerA.address], goldClaimAt + DAY + 1n);
  assert.equal(afterPrestige[3].wood, 80n, "prestige resets protected resources to the fresh-village state");
  assert.equal(afterPrestige[4].wood, 0n, "prestige clears raidable field resources");
  assert.equal(afterPrestige[5].townhall, 0n, "prestige resets village construction progress");
  assert.equal(afterPrestige[9], 1n, "prestige progress survives the village reset");
  const earnedMultiplier = await readGame(game, "productionMultiplierBps", [playerA.address], goldClaimAt + DAY + 1n);
  assert.equal(earnedMultiplier, 11_000n);

  const replayNonce = `0x${"cc".repeat(32)}`;
  const replay = await signedRegistration(game, playerB, nullifier, replayNonce, 1_900n);
  assert.ok(replay.execResult.exceptionError, "a World nullifier can register only one wallet");

  const unregisteredClaim = await evmCall(game, playerB.address, "claim", [], firstCollectionAt);
  assert.ok(unregisteredClaim.execResult.exceptionError, "game actions require World registration");
});
